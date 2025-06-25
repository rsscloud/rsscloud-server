const getDatabase = require('./mongodb');
const config = require('../config');

/**
 * Sets up TTL (Time To Live) index on the events collection
 * This will automatically expire log entries after the configured retention period
 */
async function setupLogRetention() {
    try {
        const db = await getDatabase();
        const collection = db.collection('events');

        const retentionSeconds = config.logRetentionHours * 3600;

        // Create TTL index on the when field (log timestamp)
        // MongoDB will automatically delete documents when 'when' is older than retentionSeconds
        await collection.createIndex(
            { when: 1 },
            {
                expireAfterSeconds: retentionSeconds,
                name: 'log_retention_ttl'
            }
        );

        console.log(`Log retention TTL index created: ${config.logRetentionHours} hours (${retentionSeconds} seconds)`);
    } catch (error) {
        console.error('Error setting up log retention TTL index:', error);
        throw error;
    }
}

/**
 * Manually removes expired log entries (alternative to TTL)
 * This is a fallback method if TTL index setup fails
 */
async function removeExpiredLogs() {
    try {
        const db = await getDatabase();
        const collection = db.collection('events');

        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - config.logRetentionHours);

        const result = await collection.deleteMany({
            when: { $lt: cutoffDate }
        });

        console.log(`Removed ${result.deletedCount} expired log entries older than ${cutoffDate.toISOString()}`);
        return result.deletedCount;
    } catch (error) {
        console.error('Error removing expired logs:', error);
        throw error;
    }
}

module.exports = {
    setupLogRetention,
    removeExpiredLogs
};
