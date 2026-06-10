const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// stats.js reads config.statsFilePath and core reads DATA_FILE_PATH; config
// snapshots process.env at require time, so point both at throwaway temp files
// before requiring anything.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsscloud-stats-'));
process.env.STATS_FILE_PATH = path.join(tmpDir, 'stats.json');
process.env.DATA_FILE_PATH = path.join(tmpDir, 'subscriptions.json');

const config = require('../config');
const { store } = require('../core');
const { toCoreResource, toCoreSubscription } = require('./legacy-store-shape');
const stats = require('./stats');

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

test.beforeEach(async() => {
    await clearStore();
    fs.rmSync(config.statsFilePath, { force: true });
});

test('getStats returns the default shape when no stats file exists', () => {
    assert.deepEqual(stats.getStats(), {
        generatedAt: null,
        feedsChangedLast7Days: 0,
        feedsWithSubscribers: 0,
        uniqueAggregators: 0,
        totalActiveSubscriptions: 0,
        topFeeds: [],
        moreFeeds: [],
        protocolBreakdown: { 'http-post': 0, 'https-post': 0, 'xml-rpc': 0 }
    });
});

test('generateStats persists an empty snapshot getStats reads back', async() => {
    const generated = await stats.generateStats();

    assert.equal(typeof generated.generatedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(generated.generatedAt)));
    assert.deepEqual(
        { ...generated, generatedAt: null },
        {
            generatedAt: null,
            feedsChangedLast7Days: 0,
            feedsWithSubscribers: 0,
            uniqueAggregators: 0,
            totalActiveSubscriptions: 0,
            topFeeds: [],
            moreFeeds: [],
            protocolBreakdown: { 'http-post': 0, 'https-post': 0, 'xml-rpc': 0 }
        }
    );
    assert.deepEqual(stats.getStats(), generated);
});

const DAY_MS = 24 * 60 * 60 * 1000;

test('generateStats aggregates active subscriptions into the legacy shape', async() => {
    const recent = new Date(Date.now() - DAY_MS).toISOString();
    const future = new Date(Date.now() + DAY_MS).toISOString();
    const past = new Date(Date.now() - DAY_MS).toISOString();

    await seedResource('https://a.example.com/feed.xml', {
        feedTitle: 'Alpha',
        whenLastUpdate: recent
    });
    await seedSubscriptions('https://a.example.com/feed.xml', [
        { url: 'http://sub1.example.com/notify', protocol: 'http-post', whenExpires: future },
        { url: 'http://sub2.example.com/notify', protocol: 'http-post', whenExpires: future },
        { url: 'http://gone.example.com/notify', protocol: 'http-post', whenExpires: past }
    ]);

    await seedResource('https://b.example.com/feed.xml', {
        feedTitle: 'Bravo',
        whenLastUpdate: recent
    });
    await seedSubscriptions('https://b.example.com/feed.xml', [
        { url: 'http://sub1.example.com/notify', protocol: 'http-post', whenExpires: future }
    ]);

    const generated = await stats.generateStats();

    assert.equal(generated.feedsChangedLast7Days, 2);
    assert.equal(generated.feedsWithSubscribers, 2);
    assert.equal(generated.totalActiveSubscriptions, 3);
    // sub1.example.com is shared across both feeds — counted once.
    assert.equal(generated.uniqueAggregators, 2);
    // Only http-post subs exist; https-post and xml-rpc must still be seeded at 0.
    assert.deepEqual(generated.protocolBreakdown, {
        'http-post': 3,
        'https-post': 0,
        'xml-rpc': 0
    });
    assert.deepEqual(generated.topFeeds, [
        {
            url: 'https://a.example.com/feed.xml',
            subscriberCount: 2,
            whenLastUpdate: new Date(recent).toISOString(),
            feedTitle: 'Alpha'
        },
        {
            url: 'https://b.example.com/feed.xml',
            subscriberCount: 1,
            whenLastUpdate: new Date(recent).toISOString(),
            feedTitle: 'Bravo'
        }
    ]);
    assert.deepEqual(generated.moreFeeds, []);
});

test('generateStats omits feeds whose subscriptions have all expired', async() => {
    const past = new Date(Date.now() - DAY_MS).toISOString();

    await seedResource('https://stale.example.com/feed.xml', {
        feedTitle: 'Stale',
        whenLastUpdate: new Date(Date.now() - DAY_MS).toISOString()
    });
    await seedSubscriptions('https://stale.example.com/feed.xml', [
        { url: 'http://gone.example.com/notify', protocol: 'http-post', whenExpires: past }
    ]);

    const generated = await stats.generateStats();

    assert.equal(generated.feedsWithSubscribers, 0);
    assert.equal(generated.totalActiveSubscriptions, 0);
    assert.deepEqual(generated.topFeeds, []);
    assert.deepEqual(generated.protocolBreakdown, {
        'http-post': 0,
        'https-post': 0,
        'xml-rpc': 0
    });
});
