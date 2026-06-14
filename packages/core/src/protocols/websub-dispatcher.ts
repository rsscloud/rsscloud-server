import type { RssCloudCore } from '../engine/core.js';
import type { SubscribeRequest } from '../engine/dto.js';

/**
 * Outcome of parsing a WebSub `hub.*` subscribe request: either a ready-to-drive
 * {@link SubscribeRequest}, or a malformed-request status the front door renders.
 */
export type WebSubParseResult =
    | { ok: true; request: SubscribeRequest }
    | { ok: false; status: number };

/** Any `hub.*` shape the hub can't act on is a malformed request. */
const MALFORMED: WebSubParseResult = { ok: false, status: 400 };

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
    const callback = body['hub.callback'];
    if (typeof callback !== 'string' || !isAbsoluteUrl(callback)) {
        return MALFORMED;
    }
    const topic = body['hub.topic'];
    if (typeof topic !== 'string' || topic === '') {
        return MALFORMED;
    }
    return {
        ok: true,
        request: {
            resourceUrls: [topic],
            callbackUrl: callback,
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
    core: Pick<RssCloudCore, 'acceptSubscription'>;
}

/** Parsed-body-in, status-out WebSub `hub.*` front door. */
export interface WebSubDispatcher {
    dispatch(body: Record<string, unknown>): WebSubResponse;
}

/**
 * Build the WebSub front door. A malformed `hub.*` body is rejected synchronously
 * (`400`); a valid subscribe is accepted for async intent verification
 * (`202` — see ADR-0002) by handing the built request to
 * {@link RssCloudCore.acceptSubscription}.
 */
export function createWebSubDispatcher(
    options: WebSubDispatcherOptions
): WebSubDispatcher {
    const { core } = options;

    function dispatch(body: Record<string, unknown>): WebSubResponse {
        const parsed = parseSubscribe(body);
        if (!parsed.ok) {
            return { status: parsed.status };
        }
        core.acceptSubscription(parsed.request);
        return { status: 202 };
    }

    return { dispatch };
}
