import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import {
    Agent,
    buildConnector,
    fetch as undiciFetch,
    type Dispatcher
} from 'undici';
import ipaddr from 'ipaddr.js';

/**
 * Classify an IP literal for SSRF egress safety. Returns the non-public range
 * name (e.g. `loopback`, `private`, `linkLocal`) when the address is anything
 * other than a public unicast address, or `null` when it is safe to reach.
 *
 * IPv4-mapped IPv6 forms (`::ffff:10.0.0.1`) are decoded to their IPv4 address
 * first via `ipaddr.process`, so they cannot smuggle an internal target past
 * the check.
 */
export function classifyBlockedAddress(ip: string): string | null {
    const range = ipaddr.process(ip).range();
    return range === 'unicast' ? null : range;
}

/**
 * Build an allow predicate from operator-configured CIDRs. An address that
 * falls inside any listed range is exempted from {@link classifyBlockedAddress}
 * — the escape hatch for a hub that legitimately serves feeds on a private LAN.
 * An empty list permits nothing (the predicate always returns `false`).
 */
export function createCidrAllowList(cidrs: string[]): (ip: string) => boolean {
    const ranges = cidrs.map(cidr => ipaddr.parseCIDR(cidr));
    return (ip: string): boolean => {
        const addr = ipaddr.process(ip);
        return ranges.some(([net, prefix]) => {
            if (addr.kind() !== net.kind()) {
                return false;
            }
            // kind() matched above; match's per-kind overload needs the cast.
            return (addr as ipaddr.IPv4).match([net as ipaddr.IPv4, prefix]);
        });
    };
}

/** Raised when an outbound request is refused on SSRF-egress grounds. */
export class SsrfBlockedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}

/** The reason an address is refused, or `null` if it is allowed to be reached. */
function blockedReason(
    ip: string,
    allow: ((ip: string) => boolean) | undefined
): string | null {
    if (allow?.(ip)) {
        return null;
    }
    return classifyBlockedAddress(ip);
}

/** A `dns.lookup`-shaped callback (the single- and all-address forms). */
type LookupResultCallback = (
    err: NodeJS.ErrnoException | null,
    address?: string | LookupAddress[],
    family?: number
) => void;

/** A `dns.lookup`-shaped resolver. */
export type GuardedLookupFn = (
    hostname: string,
    options: LookupOptions,
    callback: LookupResultCallback
) => void;

type Connector = ReturnType<typeof buildConnector>;

/** Construction-time dependencies for {@link createSafeFetch}. */
export interface SafeFetchOptions {
    /** Underlying fetch; defaults to undici's fetch (matches the injected agent). */
    baseFetch?: typeof fetch;
    /** Builds the pinning dispatcher from the guarded connector (injectable for tests). */
    agentFactory?: (connector: ReturnType<typeof buildConnector>) => Dispatcher;
    /** Builds the base socket connector (injectable for tests). */
    buildConnector?: typeof buildConnector;
    /** Underlying DNS resolver; defaults to `node:dns` lookup (injectable for tests). */
    lookup?: GuardedLookupFn;
    /** Optional allow predicate exempting specific addresses (e.g. a LAN range). */
    allow?: (ip: string) => boolean;
    /**
     * Per-request timeout (ms). When set, each request is aborted if it has not
     * settled within this many ms — folding the outbound timeout into the guarded
     * fetch so every caller gets both protections from one object. Omit for none.
     */
    timeoutMs?: number;
}

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Wrap a DNS resolver so every resolved address is screened before the socket
 * connects. Because the connection is pinned to the addresses validated here
 * (the dispatcher does not re-resolve), this closes DNS-rebinding: a name that
 * resolves to an internal address is rejected at connect time, on the initial
 * request and on every redirect hop alike.
 */
function createGuardedLookup(deps: {
    lookup: GuardedLookupFn;
    allow: ((ip: string) => boolean) | undefined;
}): GuardedLookupFn {
    const { lookup, allow } = deps;
    return (hostname, options, callback) => {
        lookup(hostname, options, (err, address, family) => {
            if (err) {
                callback(err);
                return;
            }
            // dns.lookup always yields an address on success (string, or a
            // LookupAddress[] when called with `all`); the cast drops the
            // error-path `undefined` the callback type carries.
            const resolved = address as string | LookupAddress[];
            const addresses = Array.isArray(resolved)
                ? resolved.map(entry => entry.address)
                : [resolved];
            for (const ip of addresses) {
                const reason = blockedReason(ip, allow);
                if (reason !== null) {
                    callback(
                        new SsrfBlockedError(
                            `Refusing to connect to ${hostname} (${ip}): ${reason} address`
                        )
                    );
                    return;
                }
            }
            callback(null, address, family);
        });
    };
}

/**
 * Wrap a socket connector so the destination address is screened. A hostname
 * target is screened during DNS resolution by the guarded lookup; an IP-literal
 * target skips DNS entirely (undici connects straight to it), so it is screened
 * here — which also covers an auto-followed redirect that lands on an internal
 * literal, since the connector runs for every connection the dispatcher opens.
 */
function createGuardedConnector(deps: {
    lookup: GuardedLookupFn;
    allow: ((ip: string) => boolean) | undefined;
    build: typeof buildConnector;
}): Connector {
    const base = deps.build({
        lookup: createGuardedLookup({
            lookup: deps.lookup,
            allow: deps.allow
        }) as unknown as LookupFunction
    });
    return (options, callback) => {
        const host = options.hostname;
        if (isIP(host) !== 0) {
            const reason = blockedReason(host, deps.allow);
            if (reason !== null) {
                callback(
                    new SsrfBlockedError(
                        `Refusing to connect to ${host}: ${reason} address`
                    ),
                    null
                );
                return;
            }
        }
        base(options, callback);
    };
}

function defaultAgentFactory(connector: Connector): Dispatcher {
    return new Agent({ connect: connector });
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function urlOf(input: FetchInput): URL {
    if (typeof input === 'string' || input instanceof URL) {
        return new URL(input);
    }
    return new URL(input.url);
}

/**
 * A `fetch` that is safe against SSRF egress. It refuses non-http(s) schemes and
 * routes every request through an undici dispatcher whose connector validates the
 * destination against {@link classifyBlockedAddress} (minus any {@link
 * SafeFetchOptions.allow} exemptions), pinning the connection to the address it
 * checked. Inject this as the `fetch` for the engine and every protocol plugin so
 * topic re-fetch, the WebSub verification GET, and content delivery are all guarded.
 */
export function createSafeFetch(options: SafeFetchOptions = {}): typeof fetch {
    const baseFetch =
        options.baseFetch ?? (undiciFetch as unknown as typeof fetch);
    const baseLookup =
        options.lookup ?? (dnsLookup as unknown as GuardedLookupFn);
    const build = options.buildConnector ?? buildConnector;
    const agentFactory = options.agentFactory ?? defaultAgentFactory;
    const dispatcher = agentFactory(
        createGuardedConnector({
            lookup: baseLookup,
            allow: options.allow,
            build
        })
    );
    const timeoutMs = options.timeoutMs;

    return (input: FetchInput, init?: FetchInit): Promise<Response> => {
        const url = urlOf(input);
        if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
            return Promise.reject(
                new SsrfBlockedError(
                    `Refusing to fetch ${url.protocol}// URL: only http and https are allowed`
                )
            );
        }
        // `dispatcher` is undici's per-request agent hook, absent from the DOM
        // RequestInit the global fetch type advertises; the base fetch is undici's.
        if (timeoutMs === undefined) {
            const guardedInit = { ...init, dispatcher } as unknown as FetchInit;
            return baseFetch(input, guardedInit);
        }
        // Abort the request if it hasn't settled within timeoutMs, always clearing
        // the timer once it does so a completed request is never aborted.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        // Preserve any caller abort signal (from init, or a Request input) by
        // combining it with the timeout's, so an external cancellation still
        // propagates instead of being clobbered by the timeout controller.
        const callerSignal =
            init?.signal ??
            (input instanceof Request ? input.signal : undefined);
        const signal = callerSignal
            ? AbortSignal.any([callerSignal, controller.signal])
            : controller.signal;
        const guardedInit = {
            ...init,
            dispatcher,
            signal
        } as unknown as FetchInit;
        return baseFetch(input, guardedInit).finally(() => clearTimeout(timer));
    };
}
