import type { RssCloudErrorCode } from '../errors.js';
import type { Protocol } from './protocol.js';

/**
 * Wire-neutral request/response DTOs — one pair per use case. Adapters
 * translate their transport (rssCloud REST/XML-RPC, WebSub `hub.*`, JSON) into
 * these and back; core never sees HTTP.
 */

/** Register or renew a subscription. rssCloud `pleaseNotify` / WebSub subscribe. */
export interface SubscribeRequest {
    /** Feeds/topics to be notified about; a subscribe may cover several. */
    resourceUrls: string[];
    /** Where notifications are delivered. */
    callbackUrl: string;
    /** Delivery protocol chosen by the subscriber. */
    protocol: Protocol;
    /** XML-RPC method name, when `protocol` is `'xml-rpc'`. */
    notifyProcedure?: string;
    /**
     * Whether the callback host differs from the requester's address. rssCloud
     * uses this to pick challenge verification vs. a same-domain test notify.
     */
    diffDomain?: boolean;
    /** Protocol-specific extras (e.g. WebSub `secret`, `leaseSeconds`). */
    details?: Record<string, unknown>;
}

/** Outcome for a single resource within a subscribe request. */
export interface SubscribeResult {
    resourceUrl: string;
    success: boolean;
    /**
     * Machine-readable cause of a per-resource failure. Adapters map this to
     * the wire wording (which differs by front door), so the engine never
     * bakes a user-facing string here.
     */
    errorCode?: RssCloudErrorCode;
}

export interface SubscribeResponse {
    success: boolean;
    message: string;
    /** Per-resource outcomes when several URLs were requested. */
    results?: SubscribeResult[];
}

/** Cancel a subscription. WebSub unsubscribe (rssCloud has no explicit form). */
export interface UnsubscribeRequest {
    resourceUrls: string[];
    callbackUrl: string;
    protocol: Protocol;
    details?: Record<string, unknown>;
}

export interface UnsubscribeResponse {
    success: boolean;
    message: string;
}

/**
 * A publisher signalling that a resource changed. The inbound protocol is
 * irrelevant by this point — it has been reduced to a URL.
 */
export interface PingRequest {
    resourceUrl: string;
}

export interface PingResponse {
    success: boolean;
    message: string;
}
