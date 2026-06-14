import type { RssCloudCore } from '../engine/core.js';
import type { SubscribeRequest, UnsubscribeRequest } from '../engine/dto.js';

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
    const secret = body['hub.secret'];
    if (typeof secret === 'string') {
        request.details = { secret };
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

/** A fully-resolved WebSub HTTP status the front door copies onto its reply. */
export interface WebSubResponse {
    status: number;
}

/** Construction-time dependencies for the WebSub front door. */
export interface WebSubDispatcherOptions {
    core: Pick<RssCloudCore, 'acceptSubscription' | 'acceptUnsubscription'>;
}

/** Parsed-body-in, status-out WebSub `hub.*` front door. */
export interface WebSubDispatcher {
    dispatch(body: Record<string, unknown>): WebSubResponse;
}

/**
 * Build the WebSub front door. A malformed `hub.*` body (or an unsupported
 * `hub.mode`) is rejected synchronously (`400`); a valid subscribe/unsubscribe
 * is accepted for async intent verification (`202` — see ADR-0002) by handing
 * the built request to {@link RssCloudCore.acceptSubscription} /
 * {@link RssCloudCore.acceptUnsubscription}.
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
        return { status: 400 };
    }

    return { dispatch };
}
