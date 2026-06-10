const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// stats.js reads config.statsFilePath, and config snapshots process.env at
// require time, so point it at a throwaway temp file before requiring anything.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsscloud-stats-'));
process.env.STATS_FILE_PATH = path.join(tmpDir, 'stats.json');

const config = require('../config');
const jsonStore = require('./json-store');
const stats = require('./stats');

test.beforeEach(() => {
    jsonStore.clear();
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

    jsonStore.setResource('https://a.example.com/feed.xml', {
        feedTitle: 'Alpha',
        whenLastUpdate: recent
    });
    jsonStore.setSubscriptions('https://a.example.com/feed.xml', [
        { url: 'http://sub1.example.com/notify', protocol: 'http-post', whenExpires: future },
        { url: 'http://sub2.example.com/notify', protocol: 'http-post', whenExpires: future },
        { url: 'http://gone.example.com/notify', protocol: 'http-post', whenExpires: past }
    ]);

    jsonStore.setResource('https://b.example.com/feed.xml', {
        feedTitle: 'Bravo',
        whenLastUpdate: recent
    });
    jsonStore.setSubscriptions('https://b.example.com/feed.xml', [
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

    jsonStore.setResource('https://stale.example.com/feed.xml', {
        feedTitle: 'Stale',
        whenLastUpdate: new Date(Date.now() - DAY_MS).toISOString()
    });
    jsonStore.setSubscriptions('https://stale.example.com/feed.xml', [
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
