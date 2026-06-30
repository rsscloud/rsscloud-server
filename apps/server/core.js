// Composition root for @rsscloud/core. Builds the protocol-neutral engine the
// server's front doors run on, wiring server config + the REST/XML-RPC delivery
// plugins to a file-backed Store.

const {
    createRssCloudCore,
    createRestProtocolPlugin,
    createXmlRpcProtocolPlugin,
    createWebSubProtocolPlugin,
    createFileStore,
    createSafeFetch,
    createCidrAllowList,
    resolveConfig
} = require('@rsscloud/core');
const config = require('./config');

const coreConfig = resolveConfig({
    minSecsBetweenPings: config.minSecsBetweenPings,
    ctSecsResourceExpire: config.ctSecsResourceExpire,
    maxConsecutiveErrors: config.maxConsecutiveErrors,
    maxResourceSize: config.maxResourceSize,
    requestTimeoutMs: config.requestTimeout,
    feedsChangedWindowDays: config.feedsChangedWindowDays,
    webSubLeaseDefaultSecs: config.webSubLeaseDefaultSecs,
    webSubLeaseMinSecs: config.webSubLeaseMinSecs,
    webSubLeaseMaxSecs: config.webSubLeaseMaxSecs
});

// SSRF egress guard for every outbound call. Built once and injected into the
// engine's topic re-fetch and each plugin's deliveries/verification GETs, so a
// subscriber- or publisher-supplied URL that resolves to an internal address
// (loopback, private, link-local / cloud-metadata) is refused at connect time.
// When protection is off (dev/CI against loopback or private hosts), `fetch` is
// left unset so callers fall back to the platform's global fetch.
const fetchOption = config.webSubSsrfProtection
    ? {
        fetch: createSafeFetch(
            config.webSubFetchAllowCidrs.length > 0
                ? { allow: createCidrAllowList(config.webSubFetchAllowCidrs) }
                : {}
        )
    }
    : {};

// Registers the 'websub' protocol so core.subscribe accepts WebSub subscriptions
// (without it, core.subscribe → UNSUPPORTED_PROTOCOL). The plugin verifies
// subscriber intent and, on fan-out, distributes the feed body to WebSub
// callbacks — advertising this hub's public URL in the Link rel="hub" header.
const plugins = [
    createRestProtocolPlugin({
        requestTimeoutMs: config.requestTimeout,
        ...fetchOption
    }),
    createXmlRpcProtocolPlugin({
        requestTimeoutMs: config.requestTimeout,
        ...fetchOption
    }),
    createWebSubProtocolPlugin({
        requestTimeoutMs: config.requestTimeout,
        hubUrl: config.hubUrl,
        signatureAlgo: config.webSubSignatureAlgo,
        ...fetchOption
    })
];

// createFileStore is async, but core.js is required synchronously — the
// @rsscloud/express middleware factories need a concrete `core` at mount time.
// core takes the store promise, resolves it once, and defers every operation
// until the load completes, so the host gets a concrete `core` immediately. The
// store stays private to core; read-side controllers use `core.listFeeds()` and
// `core.close()` flushes + closes it for the graceful-shutdown hooks in app.js.
const core = createRssCloudCore({
    store: createFileStore({
        filePath: config.dataFilePath,
        onMigrate: ({ from, to, feedCount }) =>
            console.log(
                `[file-store] migrated ${feedCount} feed(s) from legacy file ${from}; writes now target ${to}`
            )
    }),
    plugins,
    config: coreConfig,
    ...fetchOption
});

module.exports = { core, events: core.events };
