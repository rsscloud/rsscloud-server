// Composition root for @rsscloud/core. Builds the protocol-neutral engine the
// server's front doors run on, wiring server config + the REST/XML-RPC delivery
// plugins to a file-backed Store.

const {
    createRssCloudCore,
    createRestProtocolPlugin,
    createXmlRpcProtocolPlugin,
    createWebSubProtocolPlugin,
    createFileStore,
    resolveConfig
} = require('@rsscloud/core');
const config = require('./config');

const coreConfig = resolveConfig({
    minSecsBetweenPings: config.minSecsBetweenPings,
    ctSecsResourceExpire: config.ctSecsResourceExpire,
    maxConsecutiveErrors: config.maxConsecutiveErrors,
    maxResourceSize: config.maxResourceSize,
    requestTimeoutMs: config.requestTimeout,
    feedsChangedWindowDays: config.feedsChangedWindowDays
});

// Registers the 'websub' protocol so core.subscribe accepts WebSub subscriptions
// (without it, core.subscribe → UNSUPPORTED_PROTOCOL). Content distribution
// (and the hubUrl it needs) lands in a later phase; for now the plugin verifies
// subscriber intent.
const plugins = [
    createRestProtocolPlugin({ requestTimeoutMs: config.requestTimeout }),
    createXmlRpcProtocolPlugin({ requestTimeoutMs: config.requestTimeout }),
    createWebSubProtocolPlugin({ requestTimeoutMs: config.requestTimeout })
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
    config: coreConfig
});

module.exports = { core, events: core.events };
