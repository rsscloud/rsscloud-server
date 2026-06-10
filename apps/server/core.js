// Composition root for @rsscloud/core. Builds the protocol-neutral engine the
// server's front doors will run on, wiring server config + the REST/XML-RPC
// delivery plugins to a Store.
//
// During the migration (PLAN: "Endpoint migration onto @rsscloud/express") the
// Store is an adapter over the legacy synchronous json-store, so core and the
// not-yet-migrated legacy services + /test/* API share one in-memory store.
// At the end of the migration this becomes `await createFileStore({ filePath })`
// and the adapter + json-store are deleted.

const {
    createRssCloudCore,
    createRestProtocolPlugin,
    createXmlRpcProtocolPlugin,
    resolveConfig
} = require('@rsscloud/core');
const config = require('./config');
const jsonStore = require('./services/json-store');
const createJsonStoreAdapter = require('./services/core-store-adapter');

const coreConfig = resolveConfig({
    minSecsBetweenPings: config.minSecsBetweenPings,
    ctSecsResourceExpire: config.ctSecsResourceExpire,
    maxConsecutiveErrors: config.maxConsecutiveErrors,
    maxResourceSize: config.maxResourceSize,
    requestTimeoutMs: config.requestTimeout,
    feedsChangedWindowDays: config.feedsChangedWindowDays
});

const store = createJsonStoreAdapter(jsonStore);

const plugins = [
    createRestProtocolPlugin({ requestTimeoutMs: config.requestTimeout }),
    createXmlRpcProtocolPlugin({ requestTimeoutMs: config.requestTimeout })
];

const core = createRssCloudCore({ store, plugins, config: coreConfig });

module.exports = { core, events: core.events, store };
