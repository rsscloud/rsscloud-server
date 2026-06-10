const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The store is the core singleton (json-store-backed via the adapter today,
// createFileStore tomorrow). Point DATA_FILE_PATH at a throwaway temp file so
// the file store stays isolated once it backs core — config snapshots env at
// require time, so set it before requiring anything.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsscloud-rmexp-'));
process.env.DATA_FILE_PATH = path.join(tmpDir, 'subscriptions.json');

const config = require('../config');
const { store } = require('../core');
const { toCoreResource, toCoreSubscription } = require('./legacy-store-shape');
const removeExpiredSubscriptions = require('./remove-expired-subscriptions');

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();

const expired = () => iso(-DAY_MS);
const active = () => iso(DAY_MS);
const withinWindow = () => iso(-DAY_MS);
const beyondWindow = () => iso(-10 * DAY_MS);

function subscription(overrides = {}) {
    return {
        url: 'http://sub.example.com/notify',
        protocol: 'http-post',
        whenExpires: active(),
        ctConsecutiveErrors: 0,
        ...overrides
    };
}

async function seedResource(feedUrl, resource) {
    await store.putResource(feedUrl, toCoreResource(feedUrl, resource));
}

async function seedSubscriptions(feedUrl, subscriptions) {
    await store.putSubscriptions(feedUrl, subscriptions.map(toCoreSubscription));
}

async function clearStore() {
    for (const { feedUrl } of await store.list()) {
        await store.remove(feedUrl);
    }
}

async function entryFor(feedUrl) {
    return (await store.list()).find(e => e.feedUrl === feedUrl);
}

test.beforeEach(clearStore);

test('removes an expired subscription and prunes the now-empty feed', async() => {
    const feed = 'https://a.example.com/feed.xml';
    await seedSubscriptions(feed, [subscription({ whenExpires: expired() })]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 1);
    assert.equal(await entryFor(feed), undefined);
});

test('clears an expired subscription but retains a recently-updated feed', async() => {
    const feed = 'https://b.example.com/feed.xml';
    await seedResource(feed, {
        feedTitle: 'Bravo',
        whenLastUpdate: withinWindow()
    });
    await seedSubscriptions(feed, [subscription({ whenExpires: expired() })]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 1);
    const entry = await entryFor(feed);
    assert.ok(entry);
    assert.deepEqual(entry.subscriptions, []);
});

test('removes a feed whose resource is older than the retention window', async() => {
    const feed = 'https://c.example.com/feed.xml';
    await seedResource(feed, {
        feedTitle: 'Charlie',
        whenLastUpdate: beyondWindow()
    });
    await seedSubscriptions(feed, [subscription({ whenExpires: expired() })]);

    await removeExpiredSubscriptions();

    assert.equal(await entryFor(feed), undefined);
});

test('leaves active subscriptions untouched', async() => {
    const feed = 'https://d.example.com/feed.xml';
    await seedResource(feed, {
        feedTitle: 'Delta',
        whenLastUpdate: withinWindow()
    });
    await seedSubscriptions(feed, [subscription({ whenExpires: active() })]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 0);
    const entry = await entryFor(feed);
    assert.ok(entry);
    assert.equal(entry.subscriptions.length, 1);
});

test('removes an orphaned resource with no subscriptions', async() => {
    const feed = 'https://e.example.com/feed.xml';
    await seedResource(feed, {
        feedTitle: 'Echo',
        whenLastUpdate: beyondWindow()
    });

    await removeExpiredSubscriptions();

    assert.equal(await entryFor(feed), undefined);
});

test('returns the core MaintenanceResult shape', async() => {
    const feed = 'https://f.example.com/feed.xml';
    await seedSubscriptions(feed, [subscription({ whenExpires: expired() })]);

    const result = await removeExpiredSubscriptions();

    assert.deepEqual(result, {
        subscriptionsRemoved: 1,
        feedsProcessed: 1,
        feedsDeleted: 1,
        orphanedResourcesRemoved: 0
    });
});

test('removes a subscription that has reached the consecutive-error limit', async() => {
    const feed = 'https://g.example.com/feed.xml';
    await seedResource(feed, {
        feedTitle: 'Golf',
        whenLastUpdate: withinWindow()
    });
    await seedSubscriptions(feed, [
        subscription({
            whenExpires: active(),
            ctConsecutiveErrors: config.maxConsecutiveErrors
        })
    ]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 1);
    const entry = await entryFor(feed);
    assert.deepEqual(entry.subscriptions, []);
});
