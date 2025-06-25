const getDatabase = require('./mongodb');
const getDayjs = require('./dayjs-wrapper');
const config = require('../config');

/**
 * Removes expired and errored subscriptions from MongoDB
 * Works with the MongoDB schema: { _id: resourceUrl, pleaseNotify: [...] }
 */
async function removeExpiredSubscriptions() {
    try {
        const db = await getDatabase();
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
                    documentsDeleted++;
                } else {
                    // Update document with filtered subscriptions
                    await collection.updateOne(
                        { _id: doc._id },
                        { $set: { pleaseNotify: validSubscriptions } }
                    );
                }
            }
        }

        console.log(`Subscription cleanup completed: ${totalRemoved} expired/errored subscriptions removed, ${documentsProcessed} documents processed, ${documentsDeleted} empty documents deleted`);

        return {
            subscriptionsRemoved: totalRemoved,
            documentsProcessed,
            documentsDeleted
        };

    } catch (error) {
        console.error('Error removing expired subscriptions:', error);
        throw error;
    }
}

module.exports = removeExpiredSubscriptions;
