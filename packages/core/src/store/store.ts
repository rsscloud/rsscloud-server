import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';

/** One feed's complete record: its resource state and its subscribers. */
export interface FeedEntry {
    feedUrl: string;
    resource: Resource | null;
    subscriptions: Subscription[];
}

/**
 * Persistence port, injected into core. Implementations may be in-memory,
 * file-backed, or database-backed; every method is async so any backend fits.
 * Core owns all reads and writes — plugins never touch the store directly.
 */
export interface Store {
    getResource(feedUrl: string): Promise<Resource | null>;
    putResource(feedUrl: string, resource: Resource): Promise<void>;

    getSubscriptions(feedUrl: string): Promise<Subscription[]>;
    putSubscriptions(
        feedUrl: string,
        subscriptions: Subscription[]
    ): Promise<void>;

    /** Every tracked feed; used by maintenance, stats, and OPML export. */
    list(): Promise<FeedEntry[]>;

    /** Remove a feed entirely (resource + subscriptions). */
    remove(feedUrl: string): Promise<void>;
}
