// Composition root for @rsscloud/core. Builds the protocol-neutral engine the
// server's front doors run on, wiring server config + the REST/XML-RPC delivery
// plugins to a file-backed Store.

const {
    createRssCloudCore,
    createRestProtocolPlugin,
    createXmlRpcProtocolPlugin,
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

// createFileStore is async, but core.js is required synchronously — the
// @rsscloud/express middleware factories need a concrete `core` at mount time.
// Kick off the file store and front it with a proxy whose every call awaits the
// one-time load. The Store interface is already all-async, so this is
// transparent to core and to every require('./core') consumer; the first
// requests simply await initialization. flush()/close() are surfaced for the
// graceful-shutdown hooks in app.js.
const storeReady = createFileStore({ filePath: config.dataFilePath });

const store = {
    async getResource(feedUrl) {
        return (await storeReady).getResource(feedUrl);
    },
    async putResource(feedUrl, resource) {
        return (await storeReady).putResource(feedUrl, resource);
    },
    async getSubscriptions(feedUrl) {
        return (await storeReady).getSubscriptions(feedUrl);
    },
    async putSubscriptions(feedUrl, subscriptions) {
        return (await storeReady).putSubscriptions(feedUrl, subscriptions);
    },
    async list() {
        return (await storeReady).list();
    },
    async remove(feedUrl) {
        return (await storeReady).remove(feedUrl);
    },
    async flush() {
        return (await storeReady).flush();
    },
    async close() {
        return (await storeReady).close();
    }
};

const plugins = [
    createRestProtocolPlugin({ requestTimeoutMs: config.requestTimeout }),
    createXmlRpcProtocolPlugin({ requestTimeoutMs: config.requestTimeout })
];

const core = createRssCloudCore({ store, plugins, config: coreConfig });

module.exports = { core, events: core.events, store };
