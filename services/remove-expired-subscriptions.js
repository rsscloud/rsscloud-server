const mongodb = require('./mongodb');
const getDayjs = require('./dayjs-wrapper');
const jsonStore = require('./json-store');
const config = require('../config');
const ping = require('./ping');

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

        // Find subscriptions with no corresponding resource and create resources
        let resourcesCreated = 0;
        const orphanedCursor = collection.aggregate([
            {
                $lookup: {
                    from: 'resources',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'resource'
                }
            },
            {
                $match: {
                    resource: { $size: 0 }
                }
            }
        ]);

        while (await orphanedCursor.hasNext()) {
            const doc = await orphanedCursor.next();
            try {
                await ping(doc._id);
                resourcesCreated++;
            } catch (err) {
                console.log(`Failed to create resource for ${doc._id}: ${err.message}`);
            }
        }

        if (resourcesCreated > 0) {
            console.log(`Created ${resourcesCreated} missing resource documents`);
        }

        console.log(`Subscription cleanup completed: ${totalRemoved} expired/errored subscriptions removed, ${documentsProcessed} documents processed, ${documentsDeleted} empty documents deleted`);

        return {
            subscriptionsRemoved: totalRemoved,
            documentsProcessed,
            documentsDeleted,
            resourcesCreated
        };

    } catch (error) {
        console.error('Error removing expired subscriptions:', error);
        throw error;
    }
}

module.exports = removeExpiredSubscriptions;
