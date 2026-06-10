// Bridges core's async `Store` interface to the legacy synchronous `json-store`
// during the migration onto @rsscloud/core. core writes/reads through this
// adapter while the legacy services and the /test/* API keep using json-store
// directly, so both share one in-memory store. The legacy<->core shape mapping
// lives in legacy-store-shape.js (shared with the /test/* + /subscriptions.json
// seams); keep it in sync with packages/core/src/store/file-store.ts until
// json-store is retired and core uses createFileStore.

const {
    toCoreResource,
    toLegacyResource,
    toCoreSubscription,
    toLegacySubscription
} = require('./legacy-store-shape');

function createJsonStoreAdapter(jsonStore) {
    return {
        async getResource(feedUrl) {
            return toCoreResource(feedUrl, jsonStore.getResource(feedUrl));
        },

        async putResource(feedUrl, resource) {
            jsonStore.setResource(feedUrl, toLegacyResource(resource));
        },

        async getSubscriptions(feedUrl) {
            return jsonStore
                .getSubscriptions(feedUrl)
                .pleaseNotify.map(toCoreSubscription);
        },

        async putSubscriptions(feedUrl, subscriptions) {
            jsonStore.setSubscriptions(
                feedUrl,
                subscriptions.map(toLegacySubscription)
            );
        },

        async list() {
            return Object.entries(jsonStore.getData()).map(
                ([feedUrl, entry]) => ({
                    feedUrl,
                    resource: toCoreResource(feedUrl, entry.resource),
                    subscriptions: (entry.subscribers ?? []).map(
                        toCoreSubscription
                    )
                })
            );
        },

        async remove(feedUrl) {
            jsonStore.removeEntry(feedUrl);
        }
    };
}

module.exports = createJsonStoreAdapter;
