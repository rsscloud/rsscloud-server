const fs = require('fs');
const path = require('path');
const config = require('../config');

// Protocols the legacy stats shape always reports, even at zero. core only
// includes protocols it actually saw, so we seed these and merge core's counts.
const KNOWN_PROTOCOLS = ['http-post', 'https-post', 'xml-rpc'];

function getStatsFilePath() {
    return config.statsFilePath;
}

function getStats() {
    const filePath = getStatsFilePath();
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return {
            generatedAt: null,
            feedsChangedLast7Days: 0,
            feedsWithSubscribers: 0,
            uniqueAggregators: 0,
            totalActiveSubscriptions: 0,
            topFeeds: [],
            moreFeeds: [],
            protocolBreakdown: { 'http-post': 0, 'https-post': 0, 'xml-rpc': 0 }
        };
    }
}

// Map core's Stats onto the legacy wire shape the view + /stats.json expose:
// rename feedsChangedLastWindow, and report exactly the three known protocols
// (seeded at 0, dropping any core might include outside that set).
function toLegacyStats(coreStats) {
    const protocolBreakdown = {};
    for (const protocol of KNOWN_PROTOCOLS) {
        protocolBreakdown[protocol] =
            coreStats.protocolBreakdown[protocol] ?? 0;
    }
    return {
        generatedAt: coreStats.generatedAt,
        feedsChangedLast7Days: coreStats.feedsChangedLastWindow,
        feedsWithSubscribers: coreStats.feedsWithSubscribers,
        uniqueAggregators: coreStats.uniqueAggregators,
        totalActiveSubscriptions: coreStats.totalActiveSubscriptions,
        topFeeds: coreStats.topFeeds,
        moreFeeds: coreStats.moreFeeds,
        protocolBreakdown
    };
}

// Built with an injected core so callers (production wiring) supply the
// singleton while tests supply an in-memory core. getStats/scheduleStatsGeneration
// touch only the stats file (a host concern) and so don't depend on the store.
function createStats({ core }) {
    async function generateStats() {
        const stats = toLegacyStats(await core.generateStats());

        // Write atomically
        const filePath = getStatsFilePath();
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        const tmpPath = filePath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(stats, null, 2));
        fs.renameSync(tmpPath, filePath);

        console.log('Stats generated successfully');
        return stats;
    }

    function scheduleStatsGeneration() {
        setInterval(async() => {
            try {
                await generateStats();
            } catch (error) {
                console.error('Error generating stats:', error);
            }
        }, config.statsIntervalMs);
    }

    return { generateStats, getStats, scheduleStatsGeneration };
}

module.exports = { createStats };
