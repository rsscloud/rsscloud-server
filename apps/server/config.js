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

// The hub's public base URL and mount path. The WebSub endpoint mounts at
// webSubPath; hubUrl is the externally-reachable URL advertised to subscribers
// (consumed when content distribution lands), defaulting to domain/port/path.
const domain = getConfig('DOMAIN', 'localhost');
const port = getNumericConfig('PORT', 5337);
// Normalize to a leading slash so the route mount and the hubUrl composition
// stay well-formed even if WEBSUB_PATH is set without one (e.g. "websub").
const rawWebSubPath = getConfig('WEBSUB_PATH', '/websub');
const webSubPath = rawWebSubPath.startsWith('/')
    ? rawWebSubPath
    : `/${rawWebSubPath}`;

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
    webSubLeaseDefaultSecs: getNumericConfig(
        'WEBSUB_LEASE_DEFAULT_SECS',
        86400
    ),
    webSubLeaseMinSecs: getNumericConfig('WEBSUB_LEASE_MIN_SECS', 300),
    webSubLeaseMaxSecs: getNumericConfig('WEBSUB_LEASE_MAX_SECS', 864000),
    // SSRF egress protection guards every outbound fetch (topic re-fetch, the
    // WebSub verification GET, and content delivery): a request whose host
    // resolves to a non-public address (loopback, private, link-local /
    // cloud-metadata, etc.) is refused. It is always on — the only exemptions are
    // the allowlists below, so a loopback/private test setup adds the relevant
    // range (e.g. 127.0.0.0/8) rather than disabling the guard.
    //
    // CIDRs exempted from SSRF protection on the TOPIC-fetch path only — for a
    // hub that legitimately fetches feeds on a private LAN. Comma-separated,
    // e.g. "10.0.0.0/8,192.168.0.0/16". Deliberately does NOT apply to callback
    // delivery/verification, so a trusted-feed exemption can't be abused to make
    // the hub deliver to an attacker-chosen internal hub.callback.
    webSubFetchAllowCidrs: getCidrListConfig('WEBSUB_FETCH_ALLOW_CIDRS'),
    // CIDRs exempted on the CALLBACK path (delivery + verification GET) only —
    // for a hub with genuine subscribers on a private LAN. Default empty (strict):
    // attacker-supplied callbacks never inherit the topic-fetch allowlist above.
    webSubCallbackAllowCidrs: getCidrListConfig('WEBSUB_CALLBACK_ALLOW_CIDRS')
};
