import type { Protocol } from './engine/protocol.js';

/**
 * Payloads for the observability bus. Core emits these as side effects of its
 * work (Model A: delivery is dispatched directly, not driven by events); the
 * bus is for logging, stats, and optional plugin reactions.
 */
export interface RssCloudEventMap {
    /** A publisher ping was processed (whether or not the feed changed). */
    ping: {
        resourceUrl: string;
        changed: boolean;
        hash: string;
        size: number;
        durationMs: number;
    };
    /** A subscription was established or renewed. */
    subscribe: {
        callbackUrl: string;
        protocol: Protocol;
        resourceUrl: string;
        diffDomain: boolean;
    };
    /** A changed resource is about to be fanned out to its subscribers. */
    resourceChanged: {
        resourceUrl: string;
        subscriberCount: number;
    };
    /** A subscriber was successfully notified. */
    notify: {
        callbackUrl: string;
        protocol: Protocol;
        resourceUrl: string;
    };
    /** A delivery to a subscriber failed. */
    notifyFailed: {
        callbackUrl: string;
        protocol: Protocol;
        resourceUrl: string;
        error: string;
    };
    /** An unexpected error surfaced inside core. */
    error: {
        scope: string;
        error: Error;
    };
}

/** Wrapper over an event emitter. `on` returns an unsubscribe function. */
export interface EventBus {
    on<K extends keyof RssCloudEventMap>(
        event: K,
        listener: (payload: RssCloudEventMap[K]) => void
    ): () => void;
    emit<K extends keyof RssCloudEventMap>(
        event: K,
        payload: RssCloudEventMap[K]
    ): void;
}

/** Signature of the default event-bus factory core will provide. */
export type CreateEventBus = () => EventBus;

/** Listener with its payload type erased, for heterogeneous storage. */
type AnyListener = (payload: never) => void;

/** A minimal, dependency-free {@link EventBus} over an in-memory listener map. */
export const createEventBus: CreateEventBus = () => {
    const listeners = new Map<keyof RssCloudEventMap, Set<AnyListener>>();

    function on<K extends keyof RssCloudEventMap>(
        event: K,
        listener: (payload: RssCloudEventMap[K]) => void
    ): () => void {
        const set = listeners.get(event) ?? new Set<AnyListener>();
        listeners.set(event, set);
        set.add(listener as AnyListener);
        return () => {
            set.delete(listener as AnyListener);
        };
    }

    function emit<K extends keyof RssCloudEventMap>(
        event: K,
        payload: RssCloudEventMap[K]
    ): void {
        const set = listeners.get(event);
        if (set === undefined) {
            return;
        }
        for (const listener of set) {
            (listener as (payload: RssCloudEventMap[K]) => void)(payload);
        }
    }

    return { on, emit };
};
