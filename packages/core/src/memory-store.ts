import type { Resource } from './resource.js';
import type { FeedEntry, Store } from './store.js';
import type { Subscription } from './subscription.js';

interface Entry {
    resource: Resource | null;
    subscriptions: Subscription[];
}

/**
 * A Map-backed {@link Store} reference implementation. Suitable for tests, dev,
 * and small deployments; hosts that need durability supply their own Store
 * (e.g. file- or database-backed) implementing the same port.
 */
export function createInMemoryStore(): Store {
    const feeds = new Map<string, Entry>();

    function upsert(feedUrl: string): Entry {
        const existing = feeds.get(feedUrl);
        if (existing !== undefined) {
            return existing;
        }
        const created: Entry = { resource: null, subscriptions: [] };
        feeds.set(feedUrl, created);
        return created;
    }

    return {
        async getResource(feedUrl: string): Promise<Resource | null> {
            return feeds.get(feedUrl)?.resource ?? null;
        },

        async putResource(feedUrl: string, resource: Resource): Promise<void> {
            upsert(feedUrl).resource = resource;
        },

        async getSubscriptions(feedUrl: string): Promise<Subscription[]> {
            return feeds.get(feedUrl)?.subscriptions ?? [];
        },

        async putSubscriptions(
            feedUrl: string,
            subscriptions: Subscription[]
        ): Promise<void> {
            upsert(feedUrl).subscriptions = subscriptions;
        },

        async list(): Promise<FeedEntry[]> {
            return Array.from(feeds, ([feedUrl, entry]) => ({
                feedUrl,
                resource: entry.resource,
                subscriptions: entry.subscriptions
            }));
        },

        async remove(feedUrl: string): Promise<void> {
            feeds.delete(feedUrl);
        }
    };
}
