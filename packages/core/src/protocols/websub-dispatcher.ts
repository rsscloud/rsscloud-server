import type { RssCloudCore } from '../engine/core.js';
import type {
    PingRequest,
    SubscribeRequest,
    UnsubscribeRequest
} from '../engine/dto.js';

/**
 * Outcome of parsing a WebSub `hub.*` subscribe request: either a ready-to-drive
 * {@link SubscribeRequest}, or a malformed-request status the front door renders.
 */
export type WebSubParseResult =
    | { ok: true; request: SubscribeRequest }
    | { ok: false; status: number };

/** Outcome of parsing a WebSub `hub.*` unsubscribe request (see {@link WebSubParseResult}). */
export type WebSubUnsubscribeParseResult =
    | { ok: true; request: UnsubscribeRequest }
    | { ok: false; status: number };

/** Outcome of parsing a WebSub `hub.mode=publish` request (see {@link WebSubParseResult}). */
export type WebSubPublishParseResult =
    | { ok: true; request: PingRequest }
    | { ok: false; status: number };

/** Any `hub.*` shape the hub can't act on is a malformed request. */
const MALFORMED = { ok: false as const, status: 400 };

/** True when `value` parses as an absolute URL (a relative URL throws sans base). */
function isAbsoluteUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * The two fields every actionable `hub.*` request shares: a valid absolute
 * `hub.callback` and a non-empty `hub.topic`. Returns `null` when either is
 * malformed.
 */
function parseHubCallbackTopic(
    body: Record<string, unknown>
): { callback: string; topic: string } | null {
    const callback = body['hub.callback'];
    if (typeof callback !== 'string' || !isAbsoluteUrl(callback)) {
        return null;
    }
    const topic = body['hub.topic'];
    if (typeof topic !== 'string' || topic === '') {
        return null;
    }
    return { callback, topic };
}

/**
 * The updated topic a publish names: `hub.url` preferred, falling back to
 * `hub.topic` for compatibility. Returns `null` when neither is a non-empty
 * string.
 */
function publishTopic(body: Record<string, unknown>): string | null {
    const url = body['hub.url'];
    if (typeof url === 'string' && url !== '') {
        return url;
    }
    const topic = body['hub.topic'];
    if (typeof topic === 'string' && topic !== '') {
        return topic;
    }
    return null;
}

/**
 * Parse a `hub.lease_seconds` form value to a positive integer, or `undefined`
 * when absent/malformed (the hub then applies its default). Core clamps the
 * requested value to the configured bounds.
 */
function parseLeaseSeconds(value: unknown): number | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds <= 0) {
        return undefined;
    }
    return seconds;
}

/**
 * Parse and validate a WebSub subscribe form body (`hub.mode` / `hub.callback` /
 * `hub.topic`). On success builds a `websub` {@link SubscribeRequest} *directly*
 * — the complete `hub.callback` is the callback URL and `hub.topic` the sole
 * resource, so this skips `buildSubscribeRequest` (which assembles a callback
 * from port/path/domain and gates on rssCloud-only protocols).
 */
export function parseSubscribe(
    body: Record<string, unknown>
): WebSubParseResult {
    if (body['hub.mode'] !== 'subscribe') {
        return MALFORMED;
    }
    const parsed = parseHubCallbackTopic(body);
    if (parsed === null) {
        return MALFORMED;
    }
    const request: SubscribeRequest = {
        resourceUrls: [parsed.topic],
        callbackUrl: parsed.callback,
        protocol: 'websub'
    };
    const details: Record<string, unknown> = {};
    const secret = body['hub.secret'];
    if (typeof secret === 'string') {
        details['secret'] = secret;
    }
    const leaseSeconds = parseLeaseSeconds(body['hub.lease_seconds']);
    if (leaseSeconds !== undefined) {
        details['leaseSeconds'] = leaseSeconds;
    }
    if (Object.keys(details).length > 0) {
        request.details = details;
    }
    return { ok: true, request };
}

/**
 * Parse and validate a WebSub unsubscribe form body. Like {@link parseSubscribe}
 * it builds the request directly from `hub.callback`/`hub.topic`; an unsubscribe
 * carries no `details` (no secret/lease to renew).
 */
export function parseUnsubscribe(
    body: Record<string, unknown>
): WebSubUnsubscribeParseResult {
    if (body['hub.mode'] !== 'unsubscribe') {
        return MALFORMED;
    }
    const parsed = parseHubCallbackTopic(body);
    if (parsed === null) {
        return MALFORMED;
    }
    return {
        ok: true,
        request: {
            resourceUrls: [parsed.topic],
            callbackUrl: parsed.callback,
            protocol: 'websub'
        }
    };
}

/**
 * Parse and validate a WebSub publish form body. The updated topic is named by
 * `hub.url` (or `hub.topic` for compatibility); the hub re-fetches it via ping.
 */
export function parsePublish(
    body: Record<string, unknown>
): WebSubPublishParseResult {
    if (body['hub.mode'] !== 'publish') {
        return MALFORMED;
    }
    const resourceUrl = publishTopic(body);
    if (resourceUrl === null) {
        return MALFORMED;
    }
    return { ok: true, request: { resourceUrl } };
}

/** A fully-resolved WebSub HTTP status the front door copies onto its reply. */
export interface WebSubResponse {
    status: number;
}

/** Construction-time dependencies for the WebSub front door. */
export interface WebSubDispatcherOptions {
    core: Pick<
        RssCloudCore,
        'acceptSubscription' | 'acceptUnsubscription' | 'acceptPublish'
    >;
}

/** Parsed-body-in, status-out WebSub `hub.*` front door. */
export interface WebSubDispatcher {
    dispatch(body: Record<string, unknown>): WebSubResponse;
}

/**
 * Build the WebSub front door. A malformed `hub.*` body (or an unsupported
 * `hub.mode`) is rejected synchronously (`400`); a valid subscribe/unsubscribe
 * is accepted for async intent verification and a publish for an async topic
 * re-fetch (`202` — see ADR-0002) by handing the built request to
 * {@link RssCloudCore.acceptSubscription} / {@link RssCloudCore.acceptUnsubscription}
 * / {@link RssCloudCore.acceptPublish}.
 */
export function createWebSubDispatcher(
    options: WebSubDispatcherOptions
): WebSubDispatcher {
    const { core } = options;

    function dispatch(body: Record<string, unknown>): WebSubResponse {
        if (body['hub.mode'] === 'subscribe') {
            const parsed = parseSubscribe(body);
            if (!parsed.ok) {
                return { status: parsed.status };
            }
            core.acceptSubscription(parsed.request);
            return { status: 202 };
        }
        if (body['hub.mode'] === 'unsubscribe') {
            const parsed = parseUnsubscribe(body);
            if (!parsed.ok) {
                return { status: parsed.status };
            }
            core.acceptUnsubscription(parsed.request);
            return { status: 202 };
        }
        if (body['hub.mode'] === 'publish') {
            const parsed = parsePublish(body);
            if (!parsed.ok) {
                return { status: parsed.status };
            }
            core.acceptPublish(parsed.request);
            return { status: 202 };
        }
        return { status: 400 };
    }

    return { dispatch };
}
