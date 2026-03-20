const mongodb = require('./mongodb');
const getDayjs = require('./dayjs-wrapper');
const jsonStore = require('./json-store');
const config = require('../config');

/**
 * Removes expired and errored subscriptions
 * Reads from jsonStore, writes to both MongoDB and jsonStore
 */
async function removeExpiredSubscriptions() {
    try {
        const db = mongodb.get('rsscloud');
        const dayjs = await getDayjs();
        const collection = db.collection('subscriptions');

        let totalRemoved = 0;
        let documentsProcessed = 0;
        let documentsDeleted = 0;

        const storeData = jsonStore.getData();

        for (const [feedUrl, entry] of Object.entries(storeData)) {
            documentsProcessed++;

            if (!entry.subscribers || !Array.isArray(entry.subscribers) || entry.subscribers.length === 0) {
                // Remove entries with missing or empty subscribers
                await collection.deleteOne({ _id: feedUrl });
                await db.collection('resources').deleteOne({ _id: feedUrl });
                jsonStore.removeEntry(feedUrl);
                documentsDeleted++;
                continue;
            }

            // Filter out expired and errored subscriptions
            const validSubscriptions = entry.subscribers.filter(subscription => {
                // Remove if expired
                if (dayjs(subscription.whenExpires).isBefore(dayjs())) {
                    totalRemoved++;
                    return false;
                }

                // Remove if too many consecutive errors
                if (subscription.ctConsecutiveErrors > config.maxConsecutiveErrors) {
                    totalRemoved++;
                    return false;
                }

                return true;
            });

            // Update if subscriptions were removed
            if (validSubscriptions.length !== entry.subscribers.length) {
                if (validSubscriptions.length === 0) {
                    // Remove entire entry if no valid subscriptions remain
                    await collection.deleteOne({ _id: feedUrl });
                    await db.collection('resources').deleteOne({ _id: feedUrl });
                    jsonStore.removeEntry(feedUrl);
                    documentsDeleted++;
                } else {
                    // Update with filtered subscriptions
                    await collection.updateOne(
                        { _id: feedUrl },
                        { $set: { pleaseNotify: validSubscriptions } }
                    );
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
                await collection.updateOne(
                    { _id: feedUrl },
                    { $set: { pleaseNotify: fixedSubscribers } }
                );
                jsonStore.setSubscriptions(feedUrl, fixedSubscribers);
            }
        }

        if (urlsFixed > 0) {
            console.log(`Fixed ${urlsFixed} subscription URLs with IPv4-mapped IPv6 addresses`);
        }

        // Find resources with no corresponding subscription and remove them
        let orphanedResourcesRemoved = 0;
        const latestData = jsonStore.getData();

        for (const [feedUrl, entry] of Object.entries(latestData)) {
            if (entry.resource && Object.keys(entry.resource).length > 0 &&
                (!entry.subscribers || entry.subscribers.length === 0)) {
                await db.collection('resources').deleteOne({ _id: feedUrl });
                jsonStore.removeEntry(feedUrl);
                orphanedResourcesRemoved++;
            }
        }

        if (orphanedResourcesRemoved > 0) {
            console.log(`Removed ${orphanedResourcesRemoved} orphaned resource documents`);
        }

        console.log(`Subscription cleanup completed: ${totalRemoved} expired/errored subscriptions removed, ${documentsProcessed} documents processed, ${documentsDeleted} empty documents deleted, ${urlsFixed} URLs fixed, ${orphanedResourcesRemoved} orphaned resources removed`);

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
