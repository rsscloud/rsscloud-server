// Bridges core's async `Store` interface to the legacy synchronous `json-store`
// during the migration onto @rsscloud/core. core writes/reads through this
// adapter while the legacy services and the /test/* API keep using json-store
// directly, so both share one in-memory store. The legacy<->core shape mapping
// here mirrors packages/core/src/store/file-store.ts (the eventual replacement);
// keep them in sync until json-store is retired and core uses createFileStore.

function toCoreFeed(raw) {
    const feed = {};
    if (raw.feedType != null) feed.type = raw.feedType;
    if (raw.feedTitle != null) feed.title = raw.feedTitle;
    if (raw.feedDescription != null) feed.description = raw.feedDescription;
    if (raw.feedHtmlUrl != null) feed.htmlUrl = raw.feedHtmlUrl;
    if (raw.feedLanguage != null) feed.language = raw.feedLanguage;
    return Object.keys(feed).length > 0 ? feed : undefined;
}

function toCoreResource(feedUrl, raw) {
    // A missing entry or a resource with no real fields (json-store returns
    // `{ _id }` for an empty `{}` resource) is "no resource".
    if (raw == null) return null;
    if (Object.keys(raw).filter(key => key !== '_id').length === 0) return null;
    const resource = {
        url: feedUrl,
        lastHash: raw.lastHash ?? '',
        lastSize: raw.lastSize ?? 0,
        ctChecks: raw.ctChecks ?? 0,
        whenLastCheck: new Date(raw.whenLastCheck ?? 0),
        ctUpdates: raw.ctUpdates ?? 0,
        whenLastUpdate: new Date(raw.whenLastUpdate ?? 0)
    };
    const feed = toCoreFeed(raw);
    if (feed !== undefined) resource.feed = feed;
    return resource;
}

function toLegacyResource(resource) {
    const out = {
        lastSize: resource.lastSize,
        lastHash: resource.lastHash,
        ctChecks: resource.ctChecks,
        whenLastCheck: resource.whenLastCheck.toISOString(),
        ctUpdates: resource.ctUpdates,
        whenLastUpdate: resource.whenLastUpdate.toISOString()
    };
    const feed = resource.feed;
    if (feed !== undefined) {
        if (feed.type != null) out.feedType = feed.type;
        if (feed.title != null) out.feedTitle = feed.title;
        if (feed.description != null) out.feedDescription = feed.description;
        if (feed.htmlUrl != null) out.feedHtmlUrl = feed.htmlUrl;
        if (feed.language != null) out.feedLanguage = feed.language;
    }
    return out;
}

const EPOCH_ISO = new Date(0).toISOString();

// Epoch ("never happened" on disk) maps to `null` in the core model.
function toNullableDate(value) {
    const date = new Date(value ?? 0);
    return date.getTime() === 0 ? null : date;
}

// `null` ("never") serializes back to the epoch string the legacy reader uses.
function fromNullableDate(value) {
    return value === null ? EPOCH_ISO : value.toISOString();
}

function toCoreSubscription(raw) {
    const whenExpires = new Date(raw.whenExpires ?? 0);
    const subscription = {
        url: raw.url,
        protocol: raw.protocol,
        ctUpdates: raw.ctUpdates ?? 0,
        ctErrors: raw.ctErrors ?? 0,
        ctConsecutiveErrors: raw.ctConsecutiveErrors ?? 0,
        // Legacy records carry no creation time; synthesize from expiry.
        whenCreated:
            raw.whenCreated != null ? new Date(raw.whenCreated) : whenExpires,
        whenLastUpdate: toNullableDate(raw.whenLastUpdate),
        whenLastError: toNullableDate(raw.whenLastError),
        whenExpires
    };
    if (typeof raw.notifyProcedure === 'string') {
        subscription.notifyProcedure = raw.notifyProcedure;
    }
    if (raw.details !== undefined) {
        subscription.details = raw.details;
    }
    return subscription;
}

function toLegacySubscription(subscription) {
    const out = {
        ctUpdates: subscription.ctUpdates,
        whenLastUpdate: fromNullableDate(subscription.whenLastUpdate),
        ctErrors: subscription.ctErrors,
        ctConsecutiveErrors: subscription.ctConsecutiveErrors,
        whenLastError: fromNullableDate(subscription.whenLastError),
        whenExpires: subscription.whenExpires.toISOString(),
        url: subscription.url,
        // REST subs carry no procedure; the legacy shape records that as `false`.
        notifyProcedure: subscription.notifyProcedure ?? false,
        protocol: subscription.protocol
    };
    if (subscription.details !== undefined) {
        out.details = subscription.details;
    }
    return out;
}

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
