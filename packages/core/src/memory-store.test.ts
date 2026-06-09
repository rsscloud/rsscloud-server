import { describe, expect, it } from 'vitest';
import { createInMemoryStore } from './memory-store.js';
import type { Resource } from './resource.js';
import type { Subscription } from './subscription.js';

function resource(url: string): Resource {
    return {
        url,
        lastHash: 'hash',
        lastSize: 1,
        ctChecks: 1,
        whenLastCheck: new Date(0),
        ctUpdates: 0,
        whenLastUpdate: new Date(0)
    };
}

function subscription(url: string): Subscription {
    return {
        url,
        protocol: 'http-post',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: new Date(0),
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: new Date('2099-01-01T00:00:00Z')
    };
}

describe('createInMemoryStore', () => {
    it('returns null for a resource that was never stored', async () => {
        const store = createInMemoryStore();
        expect(await store.getResource('https://feed.example/rss')).toBeNull();
    });

    it('round-trips a resource', async () => {
        const store = createInMemoryStore();
        const res = resource('https://feed.example/rss');

        await store.putResource('https://feed.example/rss', res);

        expect(await store.getResource('https://feed.example/rss')).toBe(res);
    });

    it('returns an empty list for subscriptions that were never stored', async () => {
        const store = createInMemoryStore();
        expect(
            await store.getSubscriptions('https://feed.example/rss')
        ).toEqual([]);
    });

    it('round-trips subscriptions', async () => {
        const store = createInMemoryStore();
        const subs = [subscription('https://sub.example/notify')];

        await store.putSubscriptions('https://feed.example/rss', subs);

        expect(await store.getSubscriptions('https://feed.example/rss')).toBe(
            subs
        );
    });

    it('keeps subscriptions when a resource is added later', async () => {
        const store = createInMemoryStore();
        const subs = [subscription('https://sub.example/notify')];

        await store.putSubscriptions('https://feed.example/rss', subs);
        await store.putResource(
            'https://feed.example/rss',
            resource('https://feed.example/rss')
        );

        expect(await store.getSubscriptions('https://feed.example/rss')).toBe(
            subs
        );
    });

    it('keeps a resource when subscriptions are added later', async () => {
        const store = createInMemoryStore();
        const res = resource('https://feed.example/rss');

        await store.putResource('https://feed.example/rss', res);
        await store.putSubscriptions('https://feed.example/rss', [
            subscription('https://sub.example/notify')
        ]);

        expect(await store.getResource('https://feed.example/rss')).toBe(res);
    });

    it('reports null for a resource on a feed that only has subscriptions', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions('https://feed.example/rss', [
            subscription('https://sub.example/notify')
        ]);

        expect(await store.getResource('https://feed.example/rss')).toBeNull();
    });

    it('lists nothing before anything is stored', async () => {
        const store = createInMemoryStore();
        expect(await store.list()).toEqual([]);
    });

    it('lists every tracked feed with its resource and subscriptions', async () => {
        const store = createInMemoryStore();
        const res = resource('https://feed.example/rss');
        const subs = [subscription('https://sub.example/notify')];

        await store.putResource('https://feed.example/rss', res);
        await store.putSubscriptions('https://feed.example/rss', subs);

        expect(await store.list()).toEqual([
            {
                feedUrl: 'https://feed.example/rss',
                resource: res,
                subscriptions: subs
            }
        ]);
    });

    it('removes a feed entirely', async () => {
        const store = createInMemoryStore();
        await store.putResource(
            'https://feed.example/rss',
            resource('https://feed.example/rss')
        );

        await store.remove('https://feed.example/rss');

        expect(await store.getResource('https://feed.example/rss')).toBeNull();
        expect(await store.list()).toEqual([]);
    });
});
