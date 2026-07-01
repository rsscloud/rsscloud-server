import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    classifyBlockedAddress,
    createCidrAllowList,
    createSafeFetch,
    SsrfBlockedError,
    type GuardedLookupFn,
    type SafeFetchOptions
} from './safe-fetch.js';

type LooseConnector = (
    options: { hostname: string },
    callback: (err: Error | null, socket: unknown) => void
) => void;

/**
 * Build a `createSafeFetch` instance with the undici layers stubbed so the guard
 * can be exercised without a socket: `buildConnector` captures the validating DNS
 * lookup (the hostname path) and returns a recording base connector, while
 * `agentFactory` captures the guarded connector (the IP-literal path). No
 * `baseFetch` is supplied, so the undici-fetch default is selected (never called).
 */
function buildSafe(opts: Pick<SafeFetchOptions, 'lookup' | 'allow'>): {
    base: ReturnType<typeof vi.fn>;
    guardedLookup: GuardedLookupFn;
    guardedConnector: LooseConnector;
} {
    const base = vi.fn(
        (_options: unknown, callback: (e: Error | null, s: unknown) => void) =>
            callback(null, {})
    );
    let guardedLookup: GuardedLookupFn | undefined;
    let guardedConnector: LooseConnector | undefined;
    createSafeFetch({
        ...opts,
        buildConnector: ((buildOptions?: { lookup?: unknown }) => {
            guardedLookup = buildOptions?.lookup as GuardedLookupFn;
            return base as never;
        }) as unknown as NonNullable<SafeFetchOptions['buildConnector']>,
        agentFactory: connector => {
            guardedConnector = connector as unknown as LooseConnector;
            return {} as never;
        }
    });
    if (guardedLookup === undefined || guardedConnector === undefined) {
        throw new Error('createSafeFetch did not build the guard');
    }
    return { base, guardedLookup, guardedConnector };
}

describe('classifyBlockedAddress', () => {
    it('flags an IPv4 loopback address with its range name', () => {
        expect(classifyBlockedAddress('127.0.0.1')).toBe('loopback');
    });

    it.each([
        ['127.0.0.1', 'loopback'],
        ['10.0.0.1', 'private'],
        ['172.16.0.1', 'private'],
        ['192.168.1.1', 'private'],
        ['169.254.169.254', 'linkLocal'], // cloud metadata endpoint
        ['100.64.0.1', 'carrierGradeNat'],
        ['0.0.0.0', 'unspecified'],
        ['::1', 'loopback'],
        ['fe80::1', 'linkLocal'],
        ['fc00::1', 'uniqueLocal'],
        ['::ffff:10.0.0.1', 'private'] // IPv4-mapped private, decoded
    ])('blocks the non-public address %s as %s', (ip, reason) => {
        expect(classifyBlockedAddress(ip)).toBe(reason);
    });

    it.each([
        ['8.8.8.8'],
        ['1.1.1.1'],
        ['2606:4700:4700::1111'],
        ['::ffff:8.8.8.8'] // IPv4-mapped public, decoded
    ])('allows the public unicast address %s', ip => {
        expect(classifyBlockedAddress(ip)).toBeNull();
    });
});

describe('createCidrAllowList', () => {
    it('permits an address inside a configured CIDR', () => {
        const allow = createCidrAllowList(['10.0.0.0/8']);
        expect(allow('10.1.2.3')).toBe(true);
    });

    it('rejects an address outside every configured CIDR', () => {
        const allow = createCidrAllowList(['10.0.0.0/8']);
        expect(allow('192.168.1.1')).toBe(false);
    });

    it('matches against any of several configured CIDRs', () => {
        const allow = createCidrAllowList(['10.0.0.0/8', '192.168.0.0/16']);
        expect(allow('192.168.5.5')).toBe(true);
    });

    it('supports IPv6 CIDRs', () => {
        const allow = createCidrAllowList(['fc00::/7']);
        expect(allow('fc00::1234')).toBe(true);
    });

    it('does not match an address of a different family than the CIDR', () => {
        const allow = createCidrAllowList(['fc00::/7']);
        expect(allow('10.1.2.3')).toBe(false);
    });

    it('matches an IPv4-mapped address against an IPv4 CIDR', () => {
        const allow = createCidrAllowList(['10.0.0.0/8']);
        expect(allow('::ffff:10.1.2.3')).toBe(true);
    });

    it('permits nothing when the list is empty', () => {
        const allow = createCidrAllowList([]);
        expect(allow('10.1.2.3')).toBe(false);
    });
});

describe('createSafeFetch', () => {
    it('rejects a non-http(s) scheme without calling the base fetch', async () => {
        const baseFetch = vi.fn();
        const safeFetch = createSafeFetch({
            baseFetch: baseFetch as unknown as typeof fetch
        });

        await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/http/i);
        expect(baseFetch).not.toHaveBeenCalled();
    });

    it('delegates an http(s) request to the base fetch with the pinning dispatcher', async () => {
        const sentinel = {} as never;
        const baseFetch = vi.fn(async () => new Response('ok'));
        const safeFetch = createSafeFetch({
            baseFetch: baseFetch as unknown as typeof fetch,
            agentFactory: () => sentinel,
            lookup: () => {}
        });

        await safeFetch('https://feed.example/rss', { method: 'GET' });

        expect(baseFetch).toHaveBeenCalledWith(
            'https://feed.example/rss',
            expect.objectContaining({ method: 'GET', dispatcher: sentinel })
        );
    });

    it('parses the URL from a Request object input', async () => {
        const baseFetch = vi.fn(async () => new Response('ok'));
        const safeFetch = createSafeFetch({
            baseFetch: baseFetch as unknown as typeof fetch,
            agentFactory: () => ({}) as never,
            lookup: () => {}
        });

        await safeFetch(new Request('https://feed.example/rss'));

        expect(baseFetch).toHaveBeenCalledTimes(1);
    });

    // --- hostname targets: screened during DNS resolution by the guarded lookup ---

    it('blocks a hostname that resolves to an internal address', () => {
        const { guardedLookup } = buildSafe({
            lookup: (_hostname, _options, cb) =>
                cb(null, [{ address: '169.254.169.254', family: 4 }])
        });
        const cb = vi.fn();

        guardedLookup('metadata.attacker.test', {}, cb);

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb.mock.calls[0]?.[0]).toBeInstanceOf(SsrfBlockedError);
    });

    it('blocks when any address in a multi-record resolution is internal', () => {
        const { guardedLookup } = buildSafe({
            lookup: (_hostname, _options, cb) =>
                cb(null, [
                    { address: '8.8.8.8', family: 4 },
                    { address: '10.0.0.7', family: 4 }
                ])
        });
        const cb = vi.fn();

        guardedLookup('mixed.attacker.test', {}, cb);

        expect(cb.mock.calls[0]?.[0]).toBeInstanceOf(SsrfBlockedError);
    });

    it('passes a public single-address resolution through unchanged', () => {
        const { guardedLookup } = buildSafe({
            lookup: (_hostname, _options, cb) => cb(null, '1.1.1.1', 4)
        });
        const cb = vi.fn();

        guardedLookup('feed.example', {}, cb);

        expect(cb).toHaveBeenCalledWith(null, '1.1.1.1', 4);
    });

    it('passes a public multi-address resolution through unchanged', () => {
        const addresses = [{ address: '1.1.1.1', family: 4 }];
        const { guardedLookup } = buildSafe({
            lookup: (_hostname, _options, cb) => cb(null, addresses)
        });
        const cb = vi.fn();

        guardedLookup('feed.example', {}, cb);

        expect(cb).toHaveBeenCalledWith(null, addresses, undefined);
    });

    it('propagates an underlying DNS resolution error', () => {
        const dnsError = Object.assign(new Error('not found'), {
            code: 'ENOTFOUND'
        });
        const { guardedLookup } = buildSafe({
            lookup: (_hostname, _options, cb) => cb(dnsError)
        });
        const cb = vi.fn();

        guardedLookup('feed.example', {}, cb);

        expect(cb).toHaveBeenCalledWith(dnsError);
    });

    it('exempts an internal address permitted by the allow predicate', () => {
        const addresses = [{ address: '10.0.0.7', family: 4 }];
        const { guardedLookup } = buildSafe({
            lookup: (_hostname, _options, cb) => cb(null, addresses),
            allow: () => true
        });
        const cb = vi.fn();

        guardedLookup('lan.feed', {}, cb);

        expect(cb).toHaveBeenCalledWith(null, addresses, undefined);
    });

    it('still blocks an internal address the allow predicate rejects', () => {
        const { guardedLookup } = buildSafe({
            lookup: (_hostname, _options, cb) =>
                cb(null, [{ address: '10.0.0.7', family: 4 }]),
            allow: () => false
        });
        const cb = vi.fn();

        guardedLookup('lan.feed', {}, cb);

        expect(cb.mock.calls[0]?.[0]).toBeInstanceOf(SsrfBlockedError);
    });

    // --- IP-literal targets: screened at the connector (DNS is skipped) ---

    it('blocks a request to an internal IP-literal host', () => {
        const { guardedConnector, base } = buildSafe({ lookup: () => {} });
        const cb = vi.fn();

        guardedConnector({ hostname: '169.254.169.254' }, cb);

        expect(cb.mock.calls[0]?.[0]).toBeInstanceOf(SsrfBlockedError);
        expect(base).not.toHaveBeenCalled();
    });

    it('allows a request to a public IP-literal host', () => {
        const { guardedConnector, base } = buildSafe({ lookup: () => {} });
        const cb = vi.fn();

        guardedConnector({ hostname: '1.1.1.1' }, cb);

        expect(base).toHaveBeenCalledTimes(1);
    });

    it('exempts an internal IP-literal host on the allow list', () => {
        const { guardedConnector, base } = buildSafe({
            lookup: () => {},
            allow: () => true
        });
        const cb = vi.fn();

        guardedConnector({ hostname: '10.0.0.7' }, cb);

        expect(base).toHaveBeenCalledTimes(1);
    });

    it('delegates a hostname target to the base connector', () => {
        const { guardedConnector, base } = buildSafe({ lookup: () => {} });
        const cb = vi.fn();

        guardedConnector({ hostname: 'feed.example' }, cb);

        expect(base).toHaveBeenCalledTimes(1);
    });
});

describe('createSafeFetch timeout', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('forwards the request to the base fetch under an abort signal when timeoutMs is set', async () => {
        const response = new Response('ok');
        let signal: AbortSignal | undefined;
        const baseFetch = vi.fn(async (_input: unknown, init: RequestInit) => {
            signal = init.signal as AbortSignal;
            return response;
        });
        const safeFetch = createSafeFetch({
            baseFetch: baseFetch as unknown as typeof fetch,
            agentFactory: () => ({}) as never,
            lookup: () => {},
            timeoutMs: 1000
        });

        const res = await safeFetch('https://feed.example/rss', {
            method: 'GET'
        });

        expect(res).toBe(response);
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal?.aborted).toBe(false);
    });

    it('aborts the request once the timeout elapses', () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        const baseFetch = vi.fn((_input: unknown, init: RequestInit) => {
            signal = init.signal as AbortSignal;
            return new Promise<Response>(() => {});
        });
        const safeFetch = createSafeFetch({
            baseFetch: baseFetch as unknown as typeof fetch,
            agentFactory: () => ({}) as never,
            lookup: () => {},
            timeoutMs: 1000
        });

        void safeFetch('https://feed.example/rss');

        expect(signal?.aborted).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(signal?.aborted).toBe(true);
    });

    it('clears the timer once settled, so a completed request is never aborted', async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        const baseFetch = vi.fn(async (_input: unknown, init: RequestInit) => {
            signal = init.signal as AbortSignal;
            return new Response('ok');
        });
        const safeFetch = createSafeFetch({
            baseFetch: baseFetch as unknown as typeof fetch,
            agentFactory: () => ({}) as never,
            lookup: () => {},
            timeoutMs: 1000
        });

        await safeFetch('https://feed.example/rss');

        vi.advanceTimersByTime(5000);
        expect(signal?.aborted).toBe(false);
    });
});
