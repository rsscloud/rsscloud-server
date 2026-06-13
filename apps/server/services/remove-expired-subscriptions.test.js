const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createRssCloudCore,
    createInMemoryStore,
    resolveConfig
} = require('@rsscloud/core');
const createRemoveExpiredSubscriptions = require('./remove-expired-subscriptions');

const coreConfig = resolveConfig({});
const DAY_MS = 24 * 60 * 60 * 1000;
const at = offsetMs => new Date(Date.now() + offsetMs);

const expired = () => at(-DAY_MS);
const active = () => at(DAY_MS);
const withinWindow = () => at(-DAY_MS);
const beyondWindow = () => at(-10 * DAY_MS);

// A fresh in-memory-backed core + the service under it, fully isolated per test
// (no shared file store, so no clear-between-tests dance).
function setup() {
    const core = createRssCloudCore({
        store: createInMemoryStore(),
        plugins: [],
        config: coreConfig
    });
    return { core, removeExpiredSubscriptions: createRemoveExpiredSubscriptions({ core }) };
}

function makeResource(feedUrl, { whenLastUpdate = new Date(0) } = {}) {
    return {
        url: feedUrl,
        lastHash: '',
        lastSize: 0,
        ctChecks: 0,
        whenLastCheck: new Date(0),
        ctUpdates: 0,
        whenLastUpdate
    };
}

function makeSubscription(overrides = {}) {
    return {
        url: 'http://sub.example.com/notify',
        protocol: 'http-post',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: active(),
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: active(),
        ...overrides
    };
}

async function entryFor(core, feedUrl) {
    return (await core.listFeeds()).find(e => e.feedUrl === feedUrl);
}

test('removes an expired subscription and prunes the now-empty feed', async() => {
    const { core, removeExpiredSubscriptions } = setup();
    const feed = 'https://a.example.com/feed.xml';
    await core.seedSubscriptions(feed, [makeSubscription({ whenExpires: expired() })]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 1);
    assert.equal(await entryFor(core, feed), undefined);
});

test('clears an expired subscription but retains a recently-updated feed', async() => {
    const { core, removeExpiredSubscriptions } = setup();
    const feed = 'https://b.example.com/feed.xml';
    await core.seedResource(feed, makeResource(feed, { whenLastUpdate: withinWindow() }));
    await core.seedSubscriptions(feed, [makeSubscription({ whenExpires: expired() })]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 1);
    const entry = await entryFor(core, feed);
    assert.ok(entry);
    assert.deepEqual(entry.subscriptions, []);
});

test('removes a feed whose resource is older than the retention window', async() => {
    const { core, removeExpiredSubscriptions } = setup();
    const feed = 'https://c.example.com/feed.xml';
    await core.seedResource(feed, makeResource(feed, { whenLastUpdate: beyondWindow() }));
    await core.seedSubscriptions(feed, [makeSubscription({ whenExpires: expired() })]);

    await removeExpiredSubscriptions();

    assert.equal(await entryFor(core, feed), undefined);
});

test('leaves active subscriptions untouched', async() => {
    const { core, removeExpiredSubscriptions } = setup();
    const feed = 'https://d.example.com/feed.xml';
    await core.seedResource(feed, makeResource(feed, { whenLastUpdate: withinWindow() }));
    await core.seedSubscriptions(feed, [makeSubscription({ whenExpires: active() })]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 0);
    const entry = await entryFor(core, feed);
    assert.ok(entry);
    assert.equal(entry.subscriptions.length, 1);
});

test('removes an orphaned resource with no subscriptions', async() => {
    const { core, removeExpiredSubscriptions } = setup();
    const feed = 'https://e.example.com/feed.xml';
    await core.seedResource(feed, makeResource(feed, { whenLastUpdate: beyondWindow() }));

    await removeExpiredSubscriptions();

    assert.equal(await entryFor(core, feed), undefined);
});

test('returns the core MaintenanceResult shape', async() => {
    const { core, removeExpiredSubscriptions } = setup();
    const feed = 'https://f.example.com/feed.xml';
    await core.seedSubscriptions(feed, [makeSubscription({ whenExpires: expired() })]);

    const result = await removeExpiredSubscriptions();

    assert.deepEqual(result, {
        subscriptionsRemoved: 1,
        feedsProcessed: 1,
        feedsDeleted: 1,
        orphanedResourcesRemoved: 0
    });
});

test('removes a subscription that has reached the consecutive-error limit', async() => {
    const { core, removeExpiredSubscriptions } = setup();
    const feed = 'https://g.example.com/feed.xml';
    await core.seedResource(feed, makeResource(feed, { whenLastUpdate: withinWindow() }));
    await core.seedSubscriptions(feed, [
        makeSubscription({
            whenExpires: active(),
            ctConsecutiveErrors: coreConfig.maxConsecutiveErrors
        })
    ]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 1);
    const entry = await entryFor(core, feed);
    assert.deepEqual(entry.subscriptions, []);
});
