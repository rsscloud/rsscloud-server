const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    createRssCloudCore,
    createInMemoryStore,
    resolveConfig
} = require('@rsscloud/core');

// generateStats/getStats persist to config.statsFilePath (a host concern, not
// the core store), so still point STATS_FILE_PATH at a throwaway temp file —
// config snapshots env at require time. The store, by contrast, is now an
// injected in-memory core, so no DATA_FILE_PATH dance is needed.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsscloud-stats-'));
process.env.STATS_FILE_PATH = path.join(tmpDir, 'stats.json');

const config = require('../config');
const { createStats } = require('./stats');

const DAY_MS = 24 * 60 * 60 * 1000;

// A fresh in-memory-backed core + the service under it, isolated per test.
function setup() {
    const core = createRssCloudCore({
        store: createInMemoryStore(),
        plugins: [],
        config: resolveConfig({})
    });
    return { core, ...createStats({ core }) };
}

function makeResource(feedUrl, { title, whenLastUpdate = new Date(0) } = {}) {
    const resource = {
        url: feedUrl,
        lastHash: '',
        lastSize: 0,
        ctChecks: 0,
        whenLastCheck: new Date(0),
        ctUpdates: 0,
        whenLastUpdate
    };
    if (title) resource.feed = { title };
    return resource;
}

function makeSubscription(overrides = {}) {
    return {
        url: 'http://sub.example.com/notify',
        protocol: 'http-post',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: new Date(),
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: new Date(Date.now() + DAY_MS),
        ...overrides
    };
}

const EMPTY_STATS = {
    generatedAt: null,
    feedsChangedLast7Days: 0,
    feedsWithSubscribers: 0,
    uniqueAggregators: 0,
    totalActiveSubscriptions: 0,
    topFeeds: [],
    moreFeeds: [],
    protocolBreakdown: { 'http-post': 0, 'https-post': 0, 'xml-rpc': 0 }
};

test.beforeEach(() => {
    fs.rmSync(config.statsFilePath, { force: true });
});

test('getStats returns the default shape when no stats file exists', () => {
    const { getStats } = setup();
    assert.deepEqual(getStats(), EMPTY_STATS);
});

test('generateStats persists an empty snapshot getStats reads back', async() => {
    const { generateStats, getStats } = setup();
    const generated = await generateStats();

    assert.equal(typeof generated.generatedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(generated.generatedAt)));
    assert.deepEqual({ ...generated, generatedAt: null }, EMPTY_STATS);
    assert.deepEqual(getStats(), generated);
});

test('generateStats aggregates active subscriptions into the legacy shape', async() => {
    const { core, generateStats } = setup();
    const recent = new Date(Date.now() - DAY_MS);
    const future = new Date(Date.now() + DAY_MS);
    const past = new Date(Date.now() - DAY_MS);

    await core.seedResource('https://a.example.com/feed.xml', makeResource('https://a.example.com/feed.xml', {
        title: 'Alpha',
        whenLastUpdate: recent
    }));
    await core.seedSubscriptions('https://a.example.com/feed.xml', [
        makeSubscription({ url: 'http://sub1.example.com/notify', whenExpires: future }),
        makeSubscription({ url: 'http://sub2.example.com/notify', whenExpires: future }),
        makeSubscription({ url: 'http://gone.example.com/notify', whenExpires: past })
    ]);

    await core.seedResource('https://b.example.com/feed.xml', makeResource('https://b.example.com/feed.xml', {
        title: 'Bravo',
        whenLastUpdate: recent
    }));
    await core.seedSubscriptions('https://b.example.com/feed.xml', [
        makeSubscription({ url: 'http://sub1.example.com/notify', whenExpires: future })
    ]);

    const generated = await generateStats();

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
            whenLastUpdate: recent.toISOString(),
            feedTitle: 'Alpha'
        },
        {
            url: 'https://b.example.com/feed.xml',
            subscriberCount: 1,
            whenLastUpdate: recent.toISOString(),
            feedTitle: 'Bravo'
        }
    ]);
    assert.deepEqual(generated.moreFeeds, []);
});

test('generateStats omits feeds whose subscriptions have all expired', async() => {
    const { core, generateStats } = setup();
    const past = new Date(Date.now() - DAY_MS);

    await core.seedResource('https://stale.example.com/feed.xml', makeResource('https://stale.example.com/feed.xml', {
        title: 'Stale',
        whenLastUpdate: new Date(Date.now() - DAY_MS)
    }));
    await core.seedSubscriptions('https://stale.example.com/feed.xml', [
        makeSubscription({ url: 'http://gone.example.com/notify', whenExpires: past })
    ]);

    const generated = await generateStats();

    assert.equal(generated.feedsWithSubscribers, 0);
    assert.equal(generated.totalActiveSubscriptions, 0);
    assert.deepEqual(generated.topFeeds, []);
    assert.deepEqual(generated.protocolBreakdown, {
        'http-post': 0,
        'https-post': 0,
        'xml-rpc': 0
    });
});
