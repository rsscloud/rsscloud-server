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

// The hub's public base URL and mount path. The WebSub endpoint mounts at
// webSubPath; hubUrl is the externally-reachable URL advertised to subscribers
// (consumed when content distribution lands), defaulting to domain/port/path.
const domain = getConfig('DOMAIN', 'localhost');
const port = getNumericConfig('PORT', 5337);
const webSubPath = getConfig('WEBSUB_PATH', '/websub');

module.exports = {
    appName: 'rssCloudServer',
    appVersion: packageJson.version,
    domain,
    port,
    maxConsecutiveErrors: getNumericConfig('MAX_CONSECUTIVE_ERRORS', 3),
    maxResourceSize: getNumericConfig('MAX_RESOURCE_SIZE', 256000),
    ctSecsResourceExpire: getNumericConfig('CT_SECS_RESOURCE_EXPIRE', 90000),
    minSecsBetweenPings: getNumericConfig('MIN_SECS_BETWEEN_PINGS', 0),
    requestTimeout: getNumericConfig('REQUEST_TIMEOUT', 4000),
    dataFilePath: getConfig('DATA_FILE_PATH', './data/subscriptions.json'),
    statsFilePath: getConfig('STATS_FILE_PATH', './data/stats.json'),
    statsIntervalMs: getNumericConfig('STATS_INTERVAL_MS', 3600000),
    feedsChangedWindowDays: getNumericConfig('FEEDS_CHANGED_WINDOW_DAYS', 7),
    webSubPath,
    hubUrl: getConfig('HUB_URL', `http://${domain}:${port}${webSubPath}`),
    // HMAC algorithm for the X-Hub-Signature header on authenticated WebSub
    // deliveries (subscribers that supplied a hub.secret). Default sha256.
    webSubSignatureAlgo: getConfig('WEBSUB_SIGNATURE_ALGO', 'sha256'),
    // WebSub lease bounds (secs): the lease granted when hub.lease_seconds is
    // omitted, and the [min, max] a requested lease is clamped to.
    webSubLeaseDefaultSecs: getNumericConfig('WEBSUB_LEASE_DEFAULT_SECS', 86400),
    webSubLeaseMinSecs: getNumericConfig('WEBSUB_LEASE_MIN_SECS', 300),
    webSubLeaseMaxSecs: getNumericConfig('WEBSUB_LEASE_MAX_SECS', 864000),
    // SSRF egress protection for outbound fetches (topic re-fetch, the WebSub
    // verification GET, and content delivery). On by default; an outbound
    // request whose host resolves to a non-public address (loopback, private,
    // link-local / cloud-metadata, etc.) is refused. Set
    // WEBSUB_SSRF_PROTECTION=off for local or containerised testing where
    // targets are loopback/private.
    webSubSsrfProtection: !['off', 'false', '0', 'no'].includes(
        String(getConfig('WEBSUB_SSRF_PROTECTION', 'on')).toLowerCase()
    ),
    // CIDRs exempted from SSRF protection — for a hub that legitimately serves
    // feeds on a private LAN. Comma-separated, e.g. "10.0.0.0/8,192.168.0.0/16".
    webSubFetchAllowCidrs: String(getConfig('WEBSUB_FETCH_ALLOW_CIDRS', ''))
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
};
