import { describe, expect, it } from 'vitest';
import { generateStats, removeExpired } from './maintenance.js';
import { resolveConfig } from '../config.js';
import { createInMemoryStore } from '../store/memory-store.js';
import type { Resource } from './resource.js';
import type { Subscription } from './subscription.js';

const FEED = 'https://feed.example/rss';

const NOW = new Date('2026-06-01T00:00:00Z');
const RECENT = new Date('2026-05-30T00:00:00Z');
const OLD = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2099-01-01T00:00:00Z');
const PAST = new Date('2000-01-01T00:00:00Z');

const config = resolveConfig();
const clock = (): Date => NOW;

function subscription(overrides: Partial<Subscription> = {}): Subscription {
    return {
        url: 'https://sub.example/notify',
        protocol: 'http-post',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: new Date(0),
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: new Date('2099-01-01T00:00:00Z'),
        ...overrides
    };
}

function resource(overrides: Partial<Resource> = {}): Resource {
    return {
        url: FEED,
        lastHash: 'hash',
        lastSize: 1,
        ctChecks: 1,
        whenLastCheck: new Date(0),
        ctUpdates: 0,
        whenLastUpdate: new Date(0),
        ...overrides
    };
}

describe('generateStats', () => {
    it('returns an empty snapshot for an empty store', async () => {
        const stats = await generateStats(createInMemoryStore(), config, clock);

        expect(stats).toMatchObject({
            feedsChangedLastWindow: 0,
            feedsWithSubscribers: 0,
            uniqueAggregators: 0,
            totalActiveSubscriptions: 0,
            topFeeds: [],
            moreFeeds: [],
            protocolBreakdown: {}
        });
        expect(stats.generatedAt).toBe('2026-06-01T00:00:00.000Z');
    });

    it('computes an activity snapshot across feed states', async () => {
        const store = createInMemoryStore();

        await store.putResource(
            'https://a.example/rss',
            resource({
                whenLastUpdate: RECENT,
                feed: { type: 'rss', title: 'Feed A' }
            })
        );
        await store.putSubscriptions('https://a.example/rss', [
            subscription({
                url: 'https://host1.example/notify',
                whenExpires: FUTURE
            }),
            subscription({
                url: 'https://host2.example/notify',
                whenExpires: FUTURE
            })
        ]);

        await store.putResource(
            'https://b.example/rss',
            resource({ whenLastUpdate: new Date(0) })
        );
        await store.putSubscriptions('https://b.example/rss', [
            subscription({
                url: 'https://host3.example/notify',
                protocol: 'https-post',
                whenExpires: FUTURE
            })
        ]);

        await store.putResource(
            'https://c.example/rss',
            resource({ whenLastUpdate: OLD })
        );
        await store.putSubscriptions('https://c.example/rss', [
            subscription({ url: 'not a url', whenExpires: FUTURE })
        ]);

        await store.putSubscriptions('https://d.example/rss', [
            subscription({
                url: 'https://host4.example/notify',
                whenExpires: FUTURE
            })
        ]);

        await store.putResource(
            'https://e.example/rss',
            resource({ whenLastUpdate: RECENT })
        );
        await store.putSubscriptions('https://e.example/rss', [
            subscription({
                url: 'https://host5.example/notify',
                whenExpires: PAST
            })
        ]);

        const stats = await generateStats(store, config, clock);

        expect(stats.feedsChangedLastWindow).toBe(2);
        expect(stats.feedsWithSubscribers).toBe(4);
        expect(stats.totalActiveSubscriptions).toBe(5);
        expect(stats.uniqueAggregators).toBe(4);
        expect(stats.protocolBreakdown).toEqual({
            'http-post': 4,
            'https-post': 1
        });

        const byUrl = Object.fromEntries(
            [...stats.topFeeds, ...stats.moreFeeds].map(feed => [feed.url, feed])
        );
        expect(byUrl['https://a.example/rss']).toMatchObject({
            feedTitle: 'Feed A',
            whenLastUpdate: '2026-05-30T00:00:00.000Z'
        });
        expect(byUrl['https://b.example/rss']).toMatchObject({
            feedTitle: null,
            whenLastUpdate: null
        });
        expect(byUrl['https://c.example/rss']).toMatchObject({
            whenLastUpdate: '2026-01-01T00:00:00.000Z'
        });
        expect(byUrl['https://d.example/rss']).toMatchObject({
            feedTitle: null,
            whenLastUpdate: null
        });
    });

    it('caps the top feeds at a ten-deep cut, keeping boundary ties', async () => {
        const store = createInMemoryStore();
        const manySubs = (prefix: string, count: number): Subscription[] =>
            Array.from({ length: count }, (_unused, i) =>
                subscription({
                    url: `https://${prefix}-h${i}.example/notify`,
                    whenExpires: FUTURE
                })
            );

        for (let i = 0; i < 11; i++) {
            await store.putSubscriptions(
                `https://big${i}.example/rss`,
                manySubs(`big${i}`, 5)
            );
        }
        for (let i = 0; i < 2; i++) {
            await store.putSubscriptions(
                `https://small${i}.example/rss`,
                manySubs(`small${i}`, 1)
            );
        }

        const stats = await generateStats(store, config, clock);

        expect(stats.feedsWithSubscribers).toBe(13);
        expect(stats.topFeeds).toHaveLength(11);
        expect(stats.moreFeeds).toHaveLength(2);
        expect(stats.topFeeds.every(f => f.subscriberCount === 5)).toBe(true);
    });
});

describe('removeExpired', () => {
    it('drops expired and error-exhausted subscriptions', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: RECENT }));
        await store.putSubscriptions(FEED, [
            subscription({
                url: 'https://valid.example/notify',
                whenExpires: FUTURE
            }),
            subscription({
                url: 'https://expired.example/notify',
                whenExpires: PAST
            }),
            subscription({
                url: 'https://exhausted.example/notify',
                whenExpires: FUTURE,
                ctConsecutiveErrors: 3
            })
        ]);

        const result = await removeExpired(store, config, clock);

        expect(result.subscriptionsRemoved).toBe(2);
        expect(result.feedsProcessed).toBe(1);
        expect(result.feedsDeleted).toBe(0);
        expect(result.orphanedResourcesRemoved).toBe(0);
        const subs = await store.getSubscriptions(FEED);
        expect(subs.map(s => s.url)).toEqual(['https://valid.example/notify']);
    });

    it('empties but retains a recently updated feed when all subs expire', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: RECENT }));
        await store.putSubscriptions(FEED, [
            subscription({ whenExpires: PAST })
        ]);

        const result = await removeExpired(store, config, clock);

        expect(result.subscriptionsRemoved).toBe(1);
        expect(result.feedsDeleted).toBe(0);
        expect(await store.list()).toHaveLength(1);
        expect(await store.getSubscriptions(FEED)).toEqual([]);
    });

    it('deletes a stale feed when all subs expire', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: OLD }));
        await store.putSubscriptions(FEED, [
            subscription({ whenExpires: PAST })
        ]);

        const result = await removeExpired(store, config, clock);

        expect(result.feedsDeleted).toBe(1);
        expect(await store.list()).toHaveLength(0);
    });

    it('leaves a healthy feed untouched', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: RECENT }));
        await store.putSubscriptions(FEED, [
            subscription({ whenExpires: FUTURE })
        ]);

        const result = await removeExpired(store, config, clock);

        expect(result.subscriptionsRemoved).toBe(0);
        expect(result.feedsProcessed).toBe(1);
        expect(await store.getSubscriptions(FEED)).toHaveLength(1);
    });

    it('removes an orphaned resource outside the retain window', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: OLD }));

        const result = await removeExpired(store, config, clock);

        expect(result.orphanedResourcesRemoved).toBe(1);
        expect(await store.list()).toHaveLength(0);
    });

    it('keeps an orphaned resource that was recently updated', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: RECENT }));

        const result = await removeExpired(store, config, clock);

        expect(result.orphanedResourcesRemoved).toBe(0);
        expect(await store.list()).toHaveLength(1);
    });

    it('removes an empty entry that has no resource', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, []);

        const result = await removeExpired(store, config, clock);

        expect(result.orphanedResourcesRemoved).toBe(1);
        expect(await store.list()).toHaveLength(0);
    });

    it('removes an orphaned resource that was never updated', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: new Date(0) }));

        const result = await removeExpired(store, config, clock);

        expect(result.orphanedResourcesRemoved).toBe(1);
        expect(await store.list()).toHaveLength(0);
    });
});
