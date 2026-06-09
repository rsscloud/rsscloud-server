import type { Protocol } from './protocol.js';

/**
 * A subscriber's standing request to be notified when a resource changes.
 *
 * The shape is rssCloud-first: the canonical fields below mirror the original
 * `pleaseNotify` record (with unused ones simply absent), while anything a
 * non-rssCloud protocol needs lives in `details`, which core stores verbatim
 * and never interprets.
 */
export interface Subscription {
    /** Subscriber callback (rssCloud apiurl / WebSub hub.callback). */
    url: string;
    /** Delivery protocol; selects the plugin used at fan-out. */
    protocol: Protocol;
    /** XML-RPC method to call; absent for REST and other protocols. */
    notifyProcedure?: string;

    /** Successful deliveries to this subscriber. */
    ctUpdates: number;
    /** Total failed deliveries. */
    ctErrors: number;
    /** Failures since the last success; drives auto-expiry. */
    ctConsecutiveErrors: number;

    /** When the subscription was first created. */
    whenCreated: Date;
    /** Last successful delivery, or `null` if none yet. */
    whenLastUpdate: Date | null;
    /** Last failed delivery, or `null` if none yet. */
    whenLastError: Date | null;
    /** When the subscription lapses unless renewed (WebSub lease maps here). */
    whenExpires: Date;

    /**
     * Protocol-specific fields owned by the delivering plugin (e.g. a WebSub
     * `secret` and `leaseSeconds`). Core round-trips this opaquely.
     */
    details?: Record<string, unknown>;
}
