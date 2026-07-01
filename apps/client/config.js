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

// Parse a comma-separated CIDR list, dropping blank entries.
function getCidrListConfig(key) {
    return String(getConfig(key, ''))
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

module.exports = {
    appName: 'rssCloudClient',
    appVersion: packageJson.version,
    domain: getConfig('DOMAIN', 'localhost'),
    port: getNumericConfig('PORT', 9000),
    hubServerUrl: getConfig('HUB_SERVER_URL', 'http://localhost:5337'),
    requestTimeout: getNumericConfig('REQUEST_TIMEOUT', 4000),
    clientFetchAllowCidrs: getCidrListConfig('CLIENT_FETCH_ALLOW_CIDRS'),
    // 1h — past this, incoming callback/feed routes 404 for the session.
    sessionCallbackIdleMs: getNumericConfig(
        'SESSION_CALLBACK_IDLE_MS',
        3600000
    ),
    // 24h — past this, a session is fully evicted from memory by the GC sweep.
    sessionGcIdleMs: getNumericConfig('SESSION_GC_IDLE_MS', 86400000),
    // 15m — how often the GC sweep runs.
    sessionGcIntervalMs: getNumericConfig('SESSION_GC_INTERVAL_MS', 900000)
};
