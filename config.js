const packageJson = require('./package.json');

// Simple config utility that reads from process.env with defaults
function getConfig(key, defaultValue) {
    return process.env[key] ?? defaultValue;
}

// Parse numeric values
function getNumericConfig(key, defaultValue) {
    const value = process.env[key];
    return value ? parseInt(value, 10) : defaultValue;
}

module.exports = {
    appName: 'rssCloudServer',
    appVersion: packageJson.version,
    domain: getConfig('DOMAIN', 'localhost'),
    port: getNumericConfig('PORT', 5337),
    mongodbUri: getConfig('MONGODB_URI', 'mongodb://localhost:27017/rsscloud'),
    maxConsecutiveErrors: getNumericConfig('MAX_CONSECUTIVE_ERRORS', 3),
    maxResourceSize: getNumericConfig('MAX_RESOURCE_SIZE', 256000),
    ctSecsResourceExpire: getNumericConfig('CT_SECS_RESOURCE_EXPIRE', 90000),
    minSecsBetweenPings: getNumericConfig('MIN_SECS_BETWEEN_PINGS', 0),
    requestTimeout: getNumericConfig('REQUEST_TIMEOUT', 4000),
    dataFilePath: getConfig('DATA_FILE_PATH', './data/subscriptions.json'),
    statsFilePath: getConfig('STATS_FILE_PATH', './data/stats.json'),
    statsIntervalMs: getNumericConfig('STATS_INTERVAL_MS', 3600000),
    feedsChangedWindowDays: getNumericConfig('FEEDS_CHANGED_WINDOW_DAYS', 7)
};
