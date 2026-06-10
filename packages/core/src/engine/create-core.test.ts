import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRssCloudCore } from './create-core.js';
import { resolveConfig } from '../config.js';
import { createEventBus } from '../events.js';
import type { RssCloudEventMap } from '../events.js';
import { createInMemoryStore } from '../store/memory-store.js';
import type { ProtocolPlugin } from './plugin.js';
import type { Resource } from './resource.js';
import type { Store } from '../store/store.js';
import type { Subscription } from './subscription.js';

const FEED = 'https://feed.example/rss';
const RSS = '<rss><channel><title>Hi</title></channel></rss>';

function fetchReturning(body: string, status = 200): typeof fetch {
    return vi.fn(
        async () => new Response(body, { status })
    ) as unknown as typeof fetch;
}

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

function deliverPlugin(
    deliver: ProtocolPlugin['deliver'],
    protocols: ProtocolPlugin['protocols'] = ['http-post', 'https-post']
): ProtocolPlugin {
    return {
        protocols,
        verify: async () => undefined,
        deliver
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

function makePlugin(overrides: Partial<ProtocolPlugin> = {}): ProtocolPlugin {
    return {
        protocols: ['http-post', 'https-post'],
        verify: vi.fn(async () => undefined),
        deliver: vi.fn(async () => ({ ok: true })),
        ...overrides
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('createRssCloudCore ping', () => {
    it('records a first ping as a change and stores the resource', async () => {
        const store = createInMemoryStore();

        const core = createRssCloudCore({
            store,
            plugins: [],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        const result = await core.ping({ resourceUrl: FEED });

        expect(result.success).toBe(true);

        const stored = await store.getResource(FEED);
        expect(stored?.ctChecks).toBe(1);
        expect(stored?.ctUpdates).toBe(1);
        expect(stored?.lastSize).toBe(RSS.length);
        expect(stored?.lastHash).not.toBe('');
        expect(stored?.feed).toMatchObject({ title: 'Hi' });
    });

    it('rejects a ping that arrives sooner than the minimum interval', async () => {
        const store = createInMemoryStore();
        const fixedNow = new Date('2026-01-01T00:00:00Z');
        await store.putResource(FEED, {
            url: FEED,
            lastHash: 'h',
            lastSize: 1,
            ctChecks: 1,
            whenLastCheck: fixedNow,
            ctUpdates: 0,
            whenLastUpdate: fixedNow
        });
        const fetchMock = fetchReturning(RSS);

        const core = createRssCloudCore({
            store,
            plugins: [],
            config: resolveConfig({ minSecsBetweenPings: 60 }),
            fetch: fetchMock,
            now: () => fixedNow
        });

        await expect(core.ping({ resourceUrl: FEED })).rejects.toMatchObject({
            code: 'PING_TOO_RECENT'
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects when the resource responds non-2xx', async () => {
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [],
            config: resolveConfig(),
            fetch: fetchReturning('error', 500)
        });

        await expect(core.ping({ resourceUrl: FEED })).rejects.toMatchObject({
            code: 'RESOURCE_READ_FAILED'
        });
    });

    it('rejects when the resource fetch throws', async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;

        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [],
            config: resolveConfig(),
            fetch: fetchMock
        });

        await expect(core.ping({ resourceUrl: FEED })).rejects.toMatchObject({
            code: 'RESOURCE_READ_FAILED'
        });
    });

    it('rejects when reading the resource times out', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(
            (_url: string | URL, init?: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(
                            Object.assign(new Error('aborted'), {
                                name: 'AbortError'
                            })
                        );
                    });
                })
        ) as unknown as typeof fetch;

        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [],
            config: resolveConfig({ requestTimeoutMs: 50 }),
            fetch: fetchMock
        });

        const assertion = expect(
            core.ping({ resourceUrl: FEED })
        ).rejects.toMatchObject({ code: 'RESOURCE_READ_FAILED' });
        await vi.advanceTimersByTimeAsync(50);
        await assertion;
    });

    it('does not re-notify when the feed is unchanged', async () => {
        const store = createInMemoryStore();
        const core = createRssCloudCore({
            store,
            plugins: [],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        await core.ping({ resourceUrl: FEED });
        await core.ping({ resourceUrl: FEED });

        const stored = await store.getResource(FEED);
        expect(stored?.ctChecks).toBe(2);
        expect(stored?.ctUpdates).toBe(1);
    });

    it('treats an empty body as a change without parsing a feed', async () => {
        const store = createInMemoryStore();
        const core = createRssCloudCore({
            store,
            plugins: [],
            config: resolveConfig(),
            fetch: fetchReturning('')
        });

        await core.ping({ resourceUrl: FEED });

        const stored = await store.getResource(FEED);
        expect(stored?.lastSize).toBe(0);
        expect(stored?.feed).toBeUndefined();
        expect(stored?.ctUpdates).toBe(1);
    });

    it('re-attempts feed parsing while metadata is still unknown', async () => {
        const parse = vi.fn(async () => null);
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [],
            config: resolveConfig(),
            fetch: fetchReturning('<notafeed/>'),
            feedParser: { parse }
        });

        await core.ping({ resourceUrl: FEED });
        await core.ping({ resourceUrl: FEED });

        expect(parse).toHaveBeenCalledTimes(2);
    });

    it('emits a ping event describing the result', async () => {
        const pings: RssCloudEventMap['ping'][] = [];
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });
        core.events.on('ping', event => pings.push(event));

        await core.ping({ resourceUrl: FEED });

        expect(pings[0]).toMatchObject({ resourceUrl: FEED, changed: true });
        expect(typeof pings[0]?.durationMs).toBe('number');
    });
});

describe('createRssCloudCore ping fan-out', () => {
    it('notifies an active subscriber when the feed changes', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, [subscription()]);
        const deliver = vi.fn(async () => ({ ok: true }));
        const notifies: RssCloudEventMap['notify'][] = [];
        const changes: RssCloudEventMap['resourceChanged'][] = [];

        const core = createRssCloudCore({
            store,
            plugins: [deliverPlugin(deliver)],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });
        core.events.on('notify', event => notifies.push(event));
        core.events.on('resourceChanged', event => changes.push(event));

        await core.ping({ resourceUrl: FEED });

        expect(deliver).toHaveBeenCalledTimes(1);
        expect(notifies).toHaveLength(1);
        expect(changes[0]).toMatchObject({ subscriberCount: 1 });

        const subs = await store.getSubscriptions(FEED);
        expect(subs[0]?.ctUpdates).toBe(1);
        expect(subs[0]?.ctConsecutiveErrors).toBe(0);
        expect(subs[0]?.whenLastUpdate).not.toBeNull();
    });

    it('records a delivery failure with the error message', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, [subscription()]);
        const deliver = vi.fn(async () => ({
            ok: false,
            error: new Error('boom')
        }));
        const failures: RssCloudEventMap['notifyFailed'][] = [];

        const core = createRssCloudCore({
            store,
            plugins: [deliverPlugin(deliver)],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });
        core.events.on('notifyFailed', event => failures.push(event));

        await core.ping({ resourceUrl: FEED });

        expect(failures[0]).toMatchObject({ error: 'boom' });
        const subs = await store.getSubscriptions(FEED);
        expect(subs[0]?.ctErrors).toBe(1);
        expect(subs[0]?.ctConsecutiveErrors).toBe(1);
        expect(subs[0]?.whenLastError).not.toBeNull();
    });

    it('falls back to a default message when a failed delivery has no error', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, [subscription()]);
        const deliver = vi.fn(async () => ({ ok: false }));
        const failures: RssCloudEventMap['notifyFailed'][] = [];

        const core = createRssCloudCore({
            store,
            plugins: [deliverPlugin(deliver)],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });
        core.events.on('notifyFailed', event => failures.push(event));

        await core.ping({ resourceUrl: FEED });

        expect(failures[0]?.error).toBe('Notification failed');
    });

    it('records a failure when no plugin handles the subscription protocol', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, [
            subscription({ protocol: 'xml-rpc' })
        ]);
        const failures: RssCloudEventMap['notifyFailed'][] = [];

        const core = createRssCloudCore({
            store,
            plugins: [],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });
        core.events.on('notifyFailed', event => failures.push(event));

        await core.ping({ resourceUrl: FEED });

        expect(failures).toHaveLength(1);
        const subs = await store.getSubscriptions(FEED);
        expect(subs[0]?.ctConsecutiveErrors).toBe(1);
    });

    it('skips expired and error-exhausted subscribers during fan-out', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, [
            subscription({ url: 'https://active.example/notify' }),
            subscription({
                url: 'https://expired.example/notify',
                whenExpires: new Date('2000-01-01T00:00:00Z')
            }),
            subscription({
                url: 'https://errored.example/notify',
                ctConsecutiveErrors: 3
            })
        ]);
        const deliver = vi.fn(async () => ({ ok: true }));
        const changes: RssCloudEventMap['resourceChanged'][] = [];

        const core = createRssCloudCore({
            store,
            plugins: [deliverPlugin(deliver)],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });
        core.events.on('resourceChanged', event => changes.push(event));

        await core.ping({ resourceUrl: FEED });

        expect(deliver).toHaveBeenCalledTimes(1);
        expect(changes[0]?.subscriberCount).toBe(1);
    });

    it('passes the changed resource and payload to the plugin', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, [subscription()]);
        const deliver = vi.fn<ProtocolPlugin['deliver']>(async () => ({
            ok: true
        }));

        const core = createRssCloudCore({
            store,
            plugins: [deliverPlugin(deliver)],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        await core.ping({ resourceUrl: FEED });

        const ctx = deliver.mock.calls[0]?.[0];
        expect(ctx?.resource.url).toBe(FEED);
        expect(ctx?.payload.body).toBe(RSS);
    });
});

describe('createRssCloudCore subscribe', () => {
    it('rejects a request with no resources', async () => {
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        await expect(
            core.subscribe({
                resourceUrls: [],
                callbackUrl: 'https://sub.example/notify',
                protocol: 'http-post'
            })
        ).rejects.toMatchObject({ code: 'NO_RESOURCES' });
    });

    it('rejects a protocol with no registered plugin', async () => {
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        await expect(
            core.subscribe({
                resourceUrls: [FEED],
                callbackUrl: 'https://sub.example/notify',
                protocol: 'xml-rpc'
            })
        ).rejects.toMatchObject({ code: 'UNSUPPORTED_PROTOCOL' });
    });

    it('seeds the resource, verifies, and stores a minimal subscription', async () => {
        const store = createInMemoryStore();
        const verify = vi.fn(async () => undefined);
        const events: RssCloudEventMap['subscribe'][] = [];

        const core = createRssCloudCore({
            store,
            plugins: [makePlugin({ verify })],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });
        core.events.on('subscribe', event => events.push(event));

        const response = await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post'
        });

        expect(response.success).toBe(true);
        expect(response.results).toEqual([
            { resourceUrl: FEED, success: true }
        ]);
        expect(verify).toHaveBeenCalledWith(
            expect.objectContaining({ resourceUrl: FEED, diffDomain: false })
        );
        expect(events[0]).toMatchObject({ resourceUrl: FEED });

        const subs = await store.getSubscriptions(FEED);
        expect(subs).toHaveLength(1);
        expect(subs[0]).toMatchObject({
            url: 'https://sub.example/notify',
            protocol: 'http-post',
            ctUpdates: 1
        });
        expect(subs[0]?.notifyProcedure).toBeUndefined();
        expect(subs[0]?.whenExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it('stores notifyProcedure and details when provided', async () => {
        const store = createInMemoryStore();
        const core = createRssCloudCore({
            store,
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post',
            notifyProcedure: 'river.feedUpdated',
            details: { secret: 's3cret' }
        });

        const subs = await store.getSubscriptions(FEED);
        expect(subs[0]?.notifyProcedure).toBe('river.feedUpdated');
        expect(subs[0]?.details).toEqual({ secret: 's3cret' });
    });

    it('passes diffDomain through to plugin verification', async () => {
        const verify = vi.fn(async () => undefined);
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [makePlugin({ verify })],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post',
            diffDomain: true
        });

        expect(verify).toHaveBeenCalledWith(
            expect.objectContaining({ diffDomain: true })
        );
    });

    it('reports a per-resource failure when verification fails', async () => {
        const store = createInMemoryStore();
        const verify = vi.fn(async () => {
            throw new Error('challenge mismatch');
        });

        const core = createRssCloudCore({
            store,
            plugins: [makePlugin({ verify })],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        const response = await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post'
        });

        expect(response.success).toBe(false);
        expect(response.results?.[0]).toMatchObject({
            success: false,
            error: 'Subscription verification failed.'
        });
        expect(await store.getSubscriptions(FEED)).toHaveLength(0);
    });

    it('reports a per-resource failure when the resource cannot be read', async () => {
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning('nope', 500)
        });

        const response = await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post'
        });

        expect(response.success).toBe(false);
        expect(response.results?.[0]?.error).toContain('could not be read');
    });

    it('reports a failure when seeding the resource throws unexpectedly', async () => {
        const store: Store = {
            ...createInMemoryStore(),
            getResource: async () => {
                throw new Error('store down');
            }
        };

        const core = createRssCloudCore({
            store,
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        const response = await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post'
        });

        expect(response.success).toBe(false);
        expect(response.results?.[0]?.success).toBe(false);
    });

    it('tolerates a too-recent seed ping and still subscribes', async () => {
        const store = createInMemoryStore();
        const fixedNow = new Date('2026-01-01T00:00:00Z');
        await store.putResource(FEED, {
            url: FEED,
            lastHash: 'h',
            lastSize: 1,
            ctChecks: 1,
            whenLastCheck: fixedNow,
            ctUpdates: 0,
            whenLastUpdate: fixedNow
        });

        const core = createRssCloudCore({
            store,
            plugins: [makePlugin()],
            config: resolveConfig({ minSecsBetweenPings: 60 }),
            fetch: fetchReturning(RSS),
            now: () => fixedNow
        });

        const response = await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post'
        });

        expect(response.success).toBe(true);
        expect(await store.getSubscriptions(FEED)).toHaveLength(1);
    });

    it('renews an existing subscription instead of duplicating it', async () => {
        const store = createInMemoryStore();
        const core = createRssCloudCore({
            store,
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });
        const request = {
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post' as const
        };

        await core.subscribe(request);
        await core.subscribe(request);

        const subs = await store.getSubscriptions(FEED);
        expect(subs).toHaveLength(1);
        expect(subs[0]?.ctUpdates).toBe(2);
    });

    it('updates procedure and details when renewing', async () => {
        const store = createInMemoryStore();
        const core = createRssCloudCore({
            store,
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post'
        });
        await core.subscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post',
            notifyProcedure: 'river.feedUpdated',
            details: { secret: 's3cret' }
        });

        const subs = await store.getSubscriptions(FEED);
        expect(subs).toHaveLength(1);
        expect(subs[0]?.notifyProcedure).toBe('river.feedUpdated');
        expect(subs[0]?.details).toEqual({ secret: 's3cret' });
    });

    it('succeeds overall when at least one resource subscribes', async () => {
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: vi.fn(async (url: string | URL) =>
                String(url).includes('good')
                    ? new Response(RSS, { status: 200 })
                    : new Response('nope', { status: 500 })
            ) as unknown as typeof fetch
        });

        const response = await core.subscribe({
            resourceUrls: [
                'https://good.example/rss',
                'https://bad.example/rss'
            ],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post'
        });

        expect(response.success).toBe(true);
        expect(response.results).toHaveLength(2);
        expect(response.results?.filter(r => r.success)).toHaveLength(1);
    });
});

describe('createRssCloudCore unsubscribe', () => {
    it('removes the matching subscription', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, [
            subscription({ url: 'https://sub.example/notify' }),
            subscription({ url: 'https://other.example/notify' })
        ]);

        const core = createRssCloudCore({
            store,
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        const response = await core.unsubscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post'
        });

        expect(response.success).toBe(true);
        const subs = await store.getSubscriptions(FEED);
        expect(subs.map(s => s.url)).toEqual(['https://other.example/notify']);
    });

    it('is a no-op when nothing matches', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, [
            subscription({ url: 'https://sub.example/notify' })
        ]);

        const core = createRssCloudCore({
            store,
            plugins: [makePlugin()],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        const response = await core.unsubscribe({
            resourceUrls: [FEED],
            callbackUrl: 'https://sub.example/notify',
            protocol: 'xml-rpc'
        });

        expect(response.success).toBe(true);
        expect(await store.getSubscriptions(FEED)).toHaveLength(1);
    });
});

describe('createRssCloudCore initialization', () => {
    it('runs each plugin init hook once', () => {
        const init = vi.fn();
        createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [makePlugin({ init })],
            config: resolveConfig(),
            fetch: fetchReturning(RSS)
        });

        expect(init).toHaveBeenCalledTimes(1);
    });

    it('defaults to the global fetch and accepts a provided event bus', async () => {
        const events = createEventBus();
        const core = createRssCloudCore({
            store: createInMemoryStore(),
            plugins: [],
            config: resolveConfig(),
            events
        });

        expect(core.events).toBe(events);
        const stats = await core.generateStats();
        expect(stats.feedsWithSubscribers).toBe(0);
    });
});

const NOW = new Date('2026-06-01T00:00:00Z');
const RECENT = new Date('2026-05-30T00:00:00Z');
const OLD = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2099-01-01T00:00:00Z');
const PAST = new Date('2000-01-01T00:00:00Z');

function maintenanceCore(store: Store, at: Date = NOW) {
    return createRssCloudCore({
        store,
        plugins: [],
        config: resolveConfig(),
        fetch: fetchReturning(''),
        now: () => at
    });
}

describe('createRssCloudCore generateStats', () => {
    it('returns an empty snapshot for an empty store', async () => {
        const stats = await maintenanceCore(createInMemoryStore()).generateStats();

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

        const stats = await maintenanceCore(store).generateStats();

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

        const stats = await maintenanceCore(store).generateStats();

        expect(stats.feedsWithSubscribers).toBe(13);
        expect(stats.topFeeds).toHaveLength(11);
        expect(stats.moreFeeds).toHaveLength(2);
        expect(stats.topFeeds.every(f => f.subscriberCount === 5)).toBe(true);
    });
});

describe('createRssCloudCore removeExpired', () => {
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

        const result = await maintenanceCore(store).removeExpired();

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

        const result = await maintenanceCore(store).removeExpired();

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

        const result = await maintenanceCore(store).removeExpired();

        expect(result.feedsDeleted).toBe(1);
        expect(await store.list()).toHaveLength(0);
    });

    it('leaves a healthy feed untouched', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: RECENT }));
        await store.putSubscriptions(FEED, [
            subscription({ whenExpires: FUTURE })
        ]);

        const result = await maintenanceCore(store).removeExpired();

        expect(result.subscriptionsRemoved).toBe(0);
        expect(result.feedsProcessed).toBe(1);
        expect(await store.getSubscriptions(FEED)).toHaveLength(1);
    });

    it('removes an orphaned resource outside the retain window', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: OLD }));

        const result = await maintenanceCore(store).removeExpired();

        expect(result.orphanedResourcesRemoved).toBe(1);
        expect(await store.list()).toHaveLength(0);
    });

    it('keeps an orphaned resource that was recently updated', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: RECENT }));

        const result = await maintenanceCore(store).removeExpired();

        expect(result.orphanedResourcesRemoved).toBe(0);
        expect(await store.list()).toHaveLength(1);
    });

    it('removes an empty entry that has no resource', async () => {
        const store = createInMemoryStore();
        await store.putSubscriptions(FEED, []);

        const result = await maintenanceCore(store).removeExpired();

        expect(result.orphanedResourcesRemoved).toBe(1);
        expect(await store.list()).toHaveLength(0);
    });

    it('removes an orphaned resource that was never updated', async () => {
        const store = createInMemoryStore();
        await store.putResource(FEED, resource({ whenLastUpdate: new Date(0) }));

        const result = await maintenanceCore(store).removeExpired();

        expect(result.orphanedResourcesRemoved).toBe(1);
        expect(await store.list()).toHaveLength(0);
    });
});
