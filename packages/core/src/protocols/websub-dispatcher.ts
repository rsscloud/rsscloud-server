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
