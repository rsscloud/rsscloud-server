const { resourceToJson, subscriptionToJson } = require('@rsscloud/core');

// Project the core store's entries onto the v2 `feeds` map — the JSON shape the
// `/subscriptions.json` raw-data view and the `/test/*` harness both expose.
// This is the core-model successor to the retired legacy-store-shape dump.
function toFeedsJson(entries) {
    const feeds = {};
    for (const { feedUrl, resource, subscriptions } of entries) {
        feeds[feedUrl] = {
            resource: resource === null ? null : resourceToJson(resource),
            subscriptions: subscriptions.map(subscriptionToJson)
        };
    }
    return feeds;
}

module.exports = { toFeedsJson };
