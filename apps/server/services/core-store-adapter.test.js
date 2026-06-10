const test = require('node:test');
const assert = require('node:assert/strict');
const jsonStore = require('./json-store');
const createJsonStoreAdapter = require('./core-store-adapter');

test('round-trips a resource through the legacy store', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);

    const resource = {
        url: 'https://example.com/feed.xml',
        lastHash: 'abc123',
        lastSize: 42,
        ctChecks: 3,
        whenLastCheck: new Date('2026-06-01T12:00:00.000Z'),
        ctUpdates: 2,
        whenLastUpdate: new Date('2026-06-02T08:30:00.000Z'),
        feed: {
            type: 'rss',
            title: 'Example',
            description: 'An example feed',
            htmlUrl: 'https://example.com',
            language: 'en'
        }
    };

    await store.putResource(resource.url, resource);

    assert.deepStrictEqual(await store.getResource(resource.url), resource);
});

test('getResource returns null for an unknown feed', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);

    assert.equal(await store.getResource('https://example.com/unknown'), null);
});

test('getResource returns null for a subscriptions-only entry', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);

    // setSubscriptions creates an entry with an empty `{}` resource.
    jsonStore.setSubscriptions('https://example.com/feed.xml', []);

    assert.equal(
        await store.getResource('https://example.com/feed.xml'),
        null
    );
});

test('round-trips a REST subscription through the legacy store', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);
    const feedUrl = 'https://example.com/feed.xml';

    const subscription = {
        url: 'https://aggregator.example/callback',
        protocol: 'https-post',
        ctUpdates: 1,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: new Date('2026-06-01T00:00:00.000Z'),
        whenLastUpdate: new Date('2026-06-02T00:00:00.000Z'),
        whenLastError: null,
        whenExpires: new Date('2026-06-03T00:00:00.000Z')
    };

    await store.putSubscriptions(feedUrl, [subscription]);

    assert.deepStrictEqual(await store.getSubscriptions(feedUrl), [
        {
            ...subscription,
            // REST subs carry no notifyProcedure (stored as `false`, dropped on read).
            // whenCreated isn't persisted; it's synthesized from whenExpires.
            whenCreated: new Date('2026-06-03T00:00:00.000Z')
        }
    ]);
});

test('getSubscriptions returns an empty array for an unknown feed', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);

    assert.deepStrictEqual(
        await store.getSubscriptions('https://example.com/unknown'),
        []
    );
});

test('round-trips an XML-RPC subscription, preserving procedure and details', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);
    const feedUrl = 'https://example.com/feed.xml';

    const subscription = {
        url: 'https://aggregator.example/rpc',
        protocol: 'xml-rpc',
        notifyProcedure: 'river.feedUpdated',
        ctUpdates: 5,
        ctErrors: 2,
        ctConsecutiveErrors: 1,
        whenCreated: new Date('2026-06-01T00:00:00.000Z'),
        whenLastUpdate: new Date('2026-06-02T00:00:00.000Z'),
        whenLastError: new Date('2026-06-02T06:00:00.000Z'),
        whenExpires: new Date('2026-06-03T00:00:00.000Z'),
        details: { secret: 's3cret', leaseSeconds: 86400 }
    };

    await store.putSubscriptions(feedUrl, [subscription]);

    assert.deepStrictEqual(await store.getSubscriptions(feedUrl), [
        { ...subscription, whenCreated: new Date('2026-06-03T00:00:00.000Z') }
    ]);
});

test('list returns every tracked feed as a core FeedEntry', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);

    const resource = {
        url: 'https://example.com/a.xml',
        lastHash: 'h',
        lastSize: 10,
        ctChecks: 1,
        whenLastCheck: new Date('2026-06-01T00:00:00.000Z'),
        ctUpdates: 1,
        whenLastUpdate: new Date('2026-06-01T00:00:00.000Z')
    };
    const subscription = {
        url: 'https://aggregator.example/cb',
        protocol: 'https-post',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: new Date('2026-06-03T00:00:00.000Z'),
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: new Date('2026-06-03T00:00:00.000Z')
    };

    await store.putResource(resource.url, resource);
    await store.putSubscriptions(resource.url, [subscription]);
    // A subscriptions-only feed: resource maps to null.
    jsonStore.setSubscriptions('https://example.com/b.xml', []);

    assert.deepStrictEqual(await store.list(), [
        { feedUrl: resource.url, resource, subscriptions: [subscription] },
        {
            feedUrl: 'https://example.com/b.xml',
            resource: null,
            subscriptions: []
        }
    ]);
});

test('remove deletes the feed entry entirely', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);
    const feedUrl = 'https://example.com/feed.xml';

    jsonStore.setSubscriptions(feedUrl, []);
    await store.remove(feedUrl);

    assert.deepStrictEqual(await store.list(), []);
    assert.equal(await store.getResource(feedUrl), null);
});

test('core writes surface in json-store in the legacy on-disk shape', async() => {
    jsonStore.clear();
    const store = createJsonStoreAdapter(jsonStore);
    const feedUrl = 'https://example.com/feed.xml';

    await store.putResource(feedUrl, {
        url: feedUrl,
        lastHash: 'h',
        lastSize: 5,
        ctChecks: 1,
        whenLastCheck: new Date('2026-06-01T00:00:00.000Z'),
        ctUpdates: 1,
        whenLastUpdate: new Date('2026-06-01T00:00:00.000Z'),
        feed: { type: 'rss', title: 'A' }
    });
    await store.putSubscriptions(feedUrl, [
        {
            url: 'https://aggregator.example/cb',
            protocol: 'https-post',
            ctUpdates: 0,
            ctErrors: 0,
            ctConsecutiveErrors: 0,
            whenCreated: new Date('2026-06-03T00:00:00.000Z'),
            whenLastUpdate: null,
            whenLastError: null,
            whenExpires: new Date('2026-06-03T00:00:00.000Z')
        }
    ]);

    // What the legacy readers (/test/getData, /subscriptions.json, stats,
    // remove-expired) see when they read json-store directly.
    assert.deepStrictEqual(jsonStore.getData(), {
        [feedUrl]: {
            resource: {
                lastSize: 5,
                lastHash: 'h',
                ctChecks: 1,
                whenLastCheck: '2026-06-01T00:00:00.000Z',
                ctUpdates: 1,
                whenLastUpdate: '2026-06-01T00:00:00.000Z',
                feedType: 'rss',
                feedTitle: 'A'
            },
            subscribers: [
                {
                    ctUpdates: 0,
                    whenLastUpdate: '1970-01-01T00:00:00.000Z',
                    ctErrors: 0,
                    ctConsecutiveErrors: 0,
                    whenLastError: '1970-01-01T00:00:00.000Z',
                    whenExpires: '2026-06-03T00:00:00.000Z',
                    url: 'https://aggregator.example/cb',
                    notifyProcedure: false,
                    protocol: 'https-post'
                }
            ]
        }
    });
});
