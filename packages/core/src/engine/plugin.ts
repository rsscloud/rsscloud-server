import type { Protocol } from './protocol.js';
import type { Resource } from './resource.js';
import type { Subscription } from './subscription.js';

/**
 * The feed body captured during change detection, handed to content-distributing
 * protocols. rssCloud delivery ignores it; WebSub signs and sends it.
 */
export interface ResourcePayload {
    body: string;
    contentType: string | null;
}

/** Outcome of a single delivery attempt. */
export interface DeliveryResult {
    ok: boolean;
    /** Present when `ok` is `false`. */
    error?: Error;
}

/** Passed to `ProtocolPlugin.verify` at subscribe time. */
export interface VerifyContext {
    subscription: Subscription;
    resourceUrl: string;
    diffDomain: boolean;
    /**
     * Which WebSub intent is being confirmed — sent as `hub.mode` on the
     * challenge GET. Absent for the rssCloud handshake (which ignores it) and
     * defaults to subscribe semantics.
     */
    mode?: 'subscribe' | 'unsubscribe';
    /**
     * The chosen WebSub lease (secs) to echo as `hub.lease_seconds` on the
     * subscribe challenge GET. Absent for rssCloud and for unsubscribe.
     */
    leaseSeconds?: number;
}

/** Passed to `ProtocolPlugin.deliver` for each fan-out notification. */
export interface DeliveryContext {
    subscription: Subscription;
    resource: Resource;
    payload: ResourcePayload;
}

/**
 * A delivery protocol. Plugins are built and wired by the host's composition
 * root (with whatever fetch/clock/config/event-bus they need) and handed to
 * core ready to use; their constructor dependencies are not core's concern.
 *
 * Core calls `verify` when a subscription is established and `deliver` for each
 * subscriber when a resource changes, selecting the plugin by the
 * subscription's `protocol`.
 */
export interface ProtocolPlugin {
    /** Protocol value(s) this plugin owns for delivery. */
    protocols: Protocol[];

    /**
     * Confirm the subscriber controls the callback (rssCloud challenge
     * handshake, WebSub verification GET, …). Throw to reject the subscription.
     */
    verify(ctx: VerifyContext): Promise<void>;

    /** Deliver a change notification to one subscriber. */
    deliver(ctx: DeliveryContext): Promise<DeliveryResult>;

    /** Optional async startup hook, run once when core is created. */
    init?(): void | Promise<void>;
}
