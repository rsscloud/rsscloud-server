const test = require('node:test');
const assert = require('node:assert/strict');

const {
    toCoreResource,
    toLegacyResource,
    toCoreSubscription,
    toLegacySubscription,
    toLegacyData
} = require('./legacy-store-shape');

const EPOCH_ISO = new Date(0).toISOString();

test('toCoreResource treats a missing or empty resource as no resource', () => {
    assert.equal(toCoreResource('https://a/feed', null), null);
    assert.equal(toCoreResource('https://a/feed', undefined), null);
    assert.equal(toCoreResource('https://a/feed', {}), null);
    // json-store hands back `{ _id }` for an empty resource — still "none".
    assert.equal(toCoreResource('https://a/feed', { _id: 'https://a/feed' }), null);
});

test('a populated resource round-trips legacy -> core -> legacy', () => {
    const legacy = {
        lastSize: 100,
        lastHash: 'abc',
        ctChecks: 3,
        whenLastCheck: '2026-06-01T00:00:00.000Z',
        ctUpdates: 2,
        whenLastUpdate: '2026-06-02T00:00:00.000Z',
        feedTitle: 'Alpha',
        feedType: 'rss'
    };

    const core = toCoreResource('https://a/feed', legacy);
    assert.equal(core.url, 'https://a/feed');
    assert.ok(core.whenLastCheck instanceof Date);
    assert.deepEqual(core.feed, { title: 'Alpha', type: 'rss' });

    assert.deepEqual(toLegacyResource(core), legacy);
});

test('a subscription round-trips legacy -> core -> legacy', () => {
    const legacy = {
        ctUpdates: 0,
        whenLastUpdate: EPOCH_ISO,
        ctErrors: 0,
        ctConsecutiveErrors: 2,
        whenLastError: EPOCH_ISO,
        whenExpires: '2026-07-01T00:00:00.000Z',
        url: 'http://sub.example.com/notify',
        notifyProcedure: false,
        protocol: 'http-post'
    };

    const core = toCoreSubscription(legacy);
    // Epoch ("never") becomes null in the core model.
    assert.equal(core.whenLastUpdate, null);
    assert.equal(core.whenLastError, null);
    assert.equal(core.ctConsecutiveErrors, 2);
    assert.ok(core.whenExpires instanceof Date);

    assert.deepEqual(toLegacySubscription(core), legacy);
});

test('toLegacySubscription defaults a missing notifyProcedure to false', () => {
    const core = toCoreSubscription({
        url: 'http://sub/notify',
        protocol: 'http-post',
        whenExpires: '2026-07-01T00:00:00.000Z'
    });
    assert.equal(core.notifyProcedure, undefined);
    assert.equal(toLegacySubscription(core).notifyProcedure, false);
});

test('toLegacyData rebuilds the nested dump, mapping a null resource to {}', () => {
    const entries = [
        {
            feedUrl: 'https://a/feed',
            resource: toCoreResource('https://a/feed', {
                lastSize: 1,
                lastHash: 'h',
                ctChecks: 1,
                whenLastCheck: '2026-06-01T00:00:00.000Z',
                ctUpdates: 1,
                whenLastUpdate: '2026-06-01T00:00:00.000Z'
            }),
            subscriptions: [
                toCoreSubscription({
                    url: 'http://sub/notify',
                    protocol: 'http-post',
                    whenExpires: '2026-07-01T00:00:00.000Z'
                })
            ]
        },
        {
            feedUrl: 'https://b/feed',
            resource: null,
            subscriptions: []
        }
    ];

    const data = toLegacyData(entries);

    assert.deepEqual(Object.keys(data), ['https://a/feed', 'https://b/feed']);
    assert.equal(data['https://a/feed'].resource.lastHash, 'h');
    assert.equal(data['https://a/feed'].subscribers.length, 1);
    assert.equal(
        data['https://a/feed'].subscribers[0].url,
        'http://sub/notify'
    );
    // Subscriptions-only feed: empty resource object, empty subscribers.
    assert.deepEqual(data['https://b/feed'], { resource: {}, subscribers: [] });
});

test('toLegacyData returns an empty object for no entries', () => {
    assert.deepEqual(toLegacyData([]), {});
});
