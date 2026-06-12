import type { FeedMetadata } from '../feed/feed.js';
import type { Protocol } from '../engine/protocol.js';
import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';

/**
 * JSON-safe projections of the core domain model: the v2 on-disk / wire shape.
 * Identical to the domain types except `Date`s become ISO-8601 strings; `null`
 * still marks "never", feed metadata stays nested, and optional fields are
 * omitted rather than emitted as `false`/epoch. These are the single source of
 * truth for (de)serializing the model — both the file store and the server's
 * raw-data/test endpoints map through them.
 */
export interface JsonResource {
    url: string;
    lastHash: string;
    lastSize: number;
    ctChecks: number;
    whenLastCheck: string;
    ctUpdates: number;
    whenLastUpdate: string;
    feed?: FeedMetadata;
}

export interface JsonSubscription {
    url: string;
    protocol: Protocol;
    notifyProcedure?: string;
    ctUpdates: number;
    ctErrors: number;
    ctConsecutiveErrors: number;
    whenCreated: string;
    whenLastUpdate: string | null;
    whenLastError: string | null;
    whenExpires: string;
    details?: Record<string, unknown>;
}

export function resourceToJson(resource: Resource): JsonResource {
    const json: JsonResource = {
        url: resource.url,
        lastHash: resource.lastHash,
        lastSize: resource.lastSize,
        ctChecks: resource.ctChecks,
        whenLastCheck: resource.whenLastCheck.toISOString(),
        ctUpdates: resource.ctUpdates,
        whenLastUpdate: resource.whenLastUpdate.toISOString()
    };
    if (resource.feed !== undefined) {
        json.feed = { ...resource.feed };
    }
    return json;
}

export function resourceFromJson(json: JsonResource): Resource {
    const resource: Resource = {
        url: json.url,
        lastHash: json.lastHash,
        lastSize: json.lastSize,
        ctChecks: json.ctChecks,
        whenLastCheck: new Date(json.whenLastCheck),
        ctUpdates: json.ctUpdates,
        whenLastUpdate: new Date(json.whenLastUpdate)
    };
    if (json.feed !== undefined) {
        resource.feed = { ...json.feed };
    }
    return resource;
}

export function subscriptionToJson(subscription: Subscription): JsonSubscription {
    const json: JsonSubscription = {
        url: subscription.url,
        protocol: subscription.protocol,
        ctUpdates: subscription.ctUpdates,
        ctErrors: subscription.ctErrors,
        ctConsecutiveErrors: subscription.ctConsecutiveErrors,
        whenCreated: subscription.whenCreated.toISOString(),
        whenLastUpdate:
            subscription.whenLastUpdate === null
                ? null
                : subscription.whenLastUpdate.toISOString(),
        whenLastError:
            subscription.whenLastError === null
                ? null
                : subscription.whenLastError.toISOString(),
        whenExpires: subscription.whenExpires.toISOString()
    };
    if (subscription.notifyProcedure !== undefined) {
        json.notifyProcedure = subscription.notifyProcedure;
    }
    if (subscription.details !== undefined) {
        json.details = subscription.details;
    }
    return json;
}

export function subscriptionFromJson(json: JsonSubscription): Subscription {
    const subscription: Subscription = {
        url: json.url,
        protocol: json.protocol,
        ctUpdates: json.ctUpdates,
        ctErrors: json.ctErrors,
        ctConsecutiveErrors: json.ctConsecutiveErrors,
        whenCreated: new Date(json.whenCreated),
        whenLastUpdate:
            json.whenLastUpdate === null ? null : new Date(json.whenLastUpdate),
        whenLastError:
            json.whenLastError === null ? null : new Date(json.whenLastError),
        whenExpires: new Date(json.whenExpires)
    };
    if (json.notifyProcedure !== undefined) {
        subscription.notifyProcedure = json.notifyProcedure;
    }
    if (json.details !== undefined) {
        subscription.details = json.details;
    }
    return subscription;
}
