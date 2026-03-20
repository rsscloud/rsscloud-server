const mongodb = require('./mongodb');
const getDayjs = require('./dayjs-wrapper');
const jsonStore = require('./json-store');
const config = require('../config');

/**
 * Removes expired and errored subscriptions from MongoDB
 * Works with the MongoDB schema: { _id: resourceUrl, pleaseNotify: [...] }
 */
async function removeExpiredSubscriptions() {
    try {
        const db = mongodb.get('rsscloud');
        const dayjs = await getDayjs();
        const collection = db.collection('subscriptions');

        let totalRemoved = 0;
        let documentsProcessed = 0;
        let documentsDeleted = 0;

        // Find all subscription documents
        const cursor = collection.find({});

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            documentsProcessed++;

            if (!doc.pleaseNotify || !Array.isArray(doc.pleaseNotify)) {
                continue;
            }

            // Filter out expired and errored subscriptions
            const validSubscriptions = doc.pleaseNotify.filter(subscription => {
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

            // Update document if subscriptions were removed
            if (validSubscriptions.length !== doc.pleaseNotify.length) {
                if (validSubscriptions.length === 0) {
                    // Remove entire document if no valid subscriptions remain
                    await collection.deleteOne({ _id: doc._id });

                    // Only remove resource if it wasn't checked in the last 24 hours
                    const resource = await db.collection('resources').findOne({ _id: doc._id });
                    if (resource && dayjs(resource.whenLastCheck).isAfter(dayjs().subtract(24, 'hours'))) {
                        jsonStore.setSubscriptions(doc._id, []);
                    } else {
                        await db.collection('resources').deleteOne({ _id: doc._id });
                        jsonStore.removeEntry(doc._id);
                    }
                    documentsDeleted++;
                } else {
                    // Update document with filtered subscriptions
                    await collection.updateOne(
                        { _id: doc._id },
                        { $set: { pleaseNotify: validSubscriptions } }
                    );
                    jsonStore.setSubscriptions(doc._id, validSubscriptions);
                }
            }
        }

        // Fix IPv4-mapped IPv6 addresses in subscription URLs (e.g. [::ffff:1.2.3.4] -> 1.2.3.4)
        let urlsFixed = 0;
        const fixCursor = collection.find({ 'pleaseNotify.url': { $regex: '::ffff:' } });

        while (await fixCursor.hasNext()) {
            const doc = await fixCursor.next();
            let changed = false;

            for (const subscription of doc.pleaseNotify) {
                const fixed = subscription.url.replace(/\[::ffff:([^\]]+)\]/, '$1');
                if (fixed !== subscription.url) {
                    subscription.url = fixed;
                    changed = true;
                    urlsFixed++;
                }
            }

            if (changed) {
                await collection.updateOne(
                    { _id: doc._id },
                    { $set: { pleaseNotify: doc.pleaseNotify } }
                );
                jsonStore.setSubscriptions(doc._id, doc.pleaseNotify);
            }
        }

        if (urlsFixed > 0) {
            console.log(`Fixed ${urlsFixed} subscription URLs with IPv4-mapped IPv6 addresses`);
        }

        // Find resources with no corresponding subscription and remove them
        let orphanedResourcesRemoved = 0;
        const orphanedResourcesCursor = db.collection('resources').aggregate([
            {
                $lookup: {
                    from: 'subscriptions',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'subscription'
                }
            },
            {
                $match: {
                    subscription: { $size: 0 }
                }
            }
        ]);

        while (await orphanedResourcesCursor.hasNext()) {
            const doc = await orphanedResourcesCursor.next();
            // Skip recently-checked resources (preserved by the subscription cleanup above)
            if (doc.whenLastCheck && dayjs(doc.whenLastCheck).isAfter(dayjs().subtract(24, 'hours'))) {
                continue;
            }
            await db.collection('resources').deleteOne({ _id: doc._id });
            jsonStore.removeEntry(doc._id);
            orphanedResourcesRemoved++;
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
