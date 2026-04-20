const getDayjs = require('./dayjs-wrapper');
const jsonStore = require('./json-store');
const config = require('../config');

function shouldRetainEmptyEntry(entry, cutoff, dayjs) {
    if (!entry.resource || !entry.resource.whenLastUpdate) {
        return false;
    }
    return dayjs(entry.resource.whenLastUpdate).isAfter(cutoff);
}

async function removeExpiredSubscriptions() {
    try {
        const dayjs = await getDayjs();
        const cutoff = dayjs().utc().subtract(config.feedsChangedWindowDays, 'days');

        let totalRemoved = 0;
        let documentsProcessed = 0;
        let documentsDeleted = 0;

        const storeData = jsonStore.getData();

        for (const [feedUrl, entry] of Object.entries(storeData)) {
            documentsProcessed++;

            if (!entry.subscribers || !Array.isArray(entry.subscribers) || entry.subscribers.length === 0) {
                if (shouldRetainEmptyEntry(entry, cutoff, dayjs)) {
                    continue;
                }
                jsonStore.removeEntry(feedUrl);
                documentsDeleted++;
                continue;
            }

            // Filter out expired and errored subscriptions
            const validSubscriptions = entry.subscribers.filter(subscription => {
                if (dayjs(subscription.whenExpires).isBefore(dayjs())) {
                    totalRemoved++;
                    return false;
                }

                if (subscription.ctConsecutiveErrors > config.maxConsecutiveErrors) {
                    totalRemoved++;
                    return false;
                }

                return true;
            });

            if (validSubscriptions.length !== entry.subscribers.length) {
                if (validSubscriptions.length === 0) {
                    if (shouldRetainEmptyEntry(entry, cutoff, dayjs)) {
                        jsonStore.setSubscriptions(feedUrl, []);
                    } else {
                        jsonStore.removeEntry(feedUrl);
                        documentsDeleted++;
                    }
                } else {
                    jsonStore.setSubscriptions(feedUrl, validSubscriptions);
                }
            }
        }

        // Fix IPv4-mapped IPv6 addresses in subscription URLs (e.g. [::ffff:1.2.3.4] -> 1.2.3.4)
        let urlsFixed = 0;
        const currentData = jsonStore.getData();

        for (const [feedUrl, entry] of Object.entries(currentData)) {
            if (!entry.subscribers || !entry.subscribers.some(sub => sub.url && sub.url.includes('::ffff:'))) {
                continue;
            }

            let changed = false;
            const fixedSubscribers = entry.subscribers.map(sub => {
                const fixed = sub.url.replace(/\[::ffff:([^\]]+)\]/, '$1');
                if (fixed !== sub.url) {
                    changed = true;
                    urlsFixed++;
                    return Object.assign({}, sub, { url: fixed });
                }
                return sub;
            });

            if (changed) {
                jsonStore.setSubscriptions(feedUrl, fixedSubscribers);
            }
        }

        // Find resources with no corresponding subscription and remove them
        let orphanedResourcesRemoved = 0;
        const latestData = jsonStore.getData();

        for (const [feedUrl, entry] of Object.entries(latestData)) {
            if (entry.resource && Object.keys(entry.resource).length > 0 &&
                (!entry.subscribers || entry.subscribers.length === 0)) {
                if (shouldRetainEmptyEntry(entry, cutoff, dayjs)) {
                    continue;
                }
                jsonStore.removeEntry(feedUrl);
                orphanedResourcesRemoved++;
            }
        }

        return {
            subscriptionsRemoved: totalRemoved,
            documentsProcessed,
            documentsDeleted,
            urlsFixed,
            orphanedResourcesRemoved
        };

    } catch (error) {
        console.error('Error removing expired subscriptions:', error);
        throw error;
    }
}

module.exports = removeExpiredSubscriptions;
