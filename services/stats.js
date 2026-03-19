const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const config = require('../config');
const getDayjs = require('./dayjs-wrapper');
const jsonStore = require('./json-store');

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
            feedsPingedLast7Days: 0,
            feedsWithSubscribers: 0,
            uniqueAggregators: 0,
            totalActiveSubscriptions: 0,
            topFeeds: [],
            protocolBreakdown: { 'http-post': 0, 'https-post': 0, 'xml-rpc': 0 }
        };
    }
}

async function generateStats() {
    const dayjs = await getDayjs();
    const now = dayjs().utc().format();
    const sevenDaysAgo = dayjs().utc().subtract(7, 'days').toDate();

    const data = jsonStore.getData();

    let feedsPingedLast7Days = 0;
    let totalActiveSubscriptions = 0;
    const hostnames = new Set();
    const protocolBreakdown = { 'http-post': 0, 'https-post': 0, 'xml-rpc': 0 };
    const feedCounts = [];

    for (const [feedUrl, entry] of Object.entries(data)) {
        // Count feeds pinged in last 7 days
        if (entry.resource?.whenLastCheck) {
            const lastCheck = new Date(entry.resource.whenLastCheck);
            if (lastCheck >= sevenDaysAgo) {
                feedsPingedLast7Days++;
            }
        }

        // Process active subscribers
        let activeCount = 0;
        for (const sub of entry.subscribers || []) {
            if (sub.whenExpires > now) {
                activeCount++;
                totalActiveSubscriptions++;

                // Collect unique hostnames
                try {
                    hostnames.add(new URL(sub.url).hostname);
                } catch {
                    // skip invalid URLs
                }

                // Protocol breakdown
                if (sub.protocol in protocolBreakdown) {
                    protocolBreakdown[sub.protocol]++;
                }
            }
        }

        if (activeCount > 0) {
            feedCounts.push({ url: feedUrl, subscriberCount: activeCount });
        }
    }

    // Top most subscribed feeds (include all ties at the boundary)
    feedCounts.sort((a, b) => b.subscriberCount - a.subscriberCount);
    let topFeeds = feedCounts.slice(0, 10);
    if (topFeeds.length === 10) {
        const threshold = topFeeds[9].subscriberCount;
        topFeeds = feedCounts.filter(f => f.subscriberCount >= threshold);
    }

    const stats = {
        generatedAt: dayjs().utc().format(),
        feedsPingedLast7Days,
        feedsWithSubscribers: feedCounts.length,
        uniqueAggregators: hostnames.size,
        totalActiveSubscriptions,
        topFeeds,
        protocolBreakdown
    };

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

module.exports = { generateStats, getStats, scheduleStatsGeneration };
