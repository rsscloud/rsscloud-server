const express = require('express'),
    {
        resourceToJson,
        resourceFromJson,
        subscriptionToJson,
        subscriptionFromJson
    } = require('@rsscloud/core'),
    { toFeedsJson } = require('../services/feeds-json');

const EPOCH_ISO = new Date(0).toISOString();

// The /test/* API speaks the core model's JSON shape (JsonResource /
// JsonSubscription). setResource stays lenient — the harness sends partial
// fixtures — filling core defaults and the feed URL before deserializing.
function resourceFromInput(feedUrl, raw) {
    return resourceFromJson({
        url: feedUrl,
        lastHash: raw.lastHash ?? '',
        lastSize: raw.lastSize ?? 0,
        ctChecks: raw.ctChecks ?? 0,
        whenLastCheck: raw.whenLastCheck ?? EPOCH_ISO,
        ctUpdates: raw.ctUpdates ?? 0,
        whenLastUpdate: raw.whenLastUpdate ?? EPOCH_ISO,
        ...(raw.feed !== undefined ? { feed: raw.feed } : {})
    });
}

// Every /test/* route shares one envelope: a handler that returns the payload
// fields (or nothing) becomes `{ success: true, ...fields }`, and any throw
// becomes a 500 `{ success: false, error }`. The handler owns only its own
// logic; the success/failure contract lives here, once.
function wrap(handler) {
    return async(req, res) => {
        try {
            res.json({ success: true, ...(await handler(req)) });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    };
}

// Built with an injected core (prod file-backed or in-memory in tests). The
// /test/* API drives core's narrow seed/snapshot seam — it never reaches into
// the store. Reads find the feed in the listFeeds() snapshot; writes go through
// seedResource/seedSubscriptions/clearFeeds.
function createTestController({ core }) {
    const router = new express.Router();

    console.warn(
        '[test-api] ENABLE_TEST_API=true — /test/* endpoints are mounted. Never enable in production.'
    );

    router.use(express.json());

    async function findEntry(feedUrl) {
        return (await core.listFeeds()).find(
            entry => entry.feedUrl === feedUrl
        );
    }

    router.post('/clear', wrap(async() => {
        await core.clearFeeds();
    }));

    router.post('/setResource', wrap(async(req) => {
        const { feedUrl, resource } = req.body;
        await core.seedResource(feedUrl, resourceFromInput(feedUrl, resource));
    }));

    router.post('/getResource', wrap(async(req) => {
        const { feedUrl } = req.body;
        const entry = await findEntry(feedUrl);
        const resource = entry?.resource ?? null;
        return {
            found: resource !== null,
            resource: resource !== null ? resourceToJson(resource) : null
        };
    }));

    router.post('/setSubscriptions', wrap(async(req) => {
        const { feedUrl, subscriptions } = req.body;
        await core.seedSubscriptions(
            feedUrl,
            subscriptions.map(subscriptionFromJson)
        );
    }));

    router.post('/getSubscriptions', wrap(async(req) => {
        const { feedUrl } = req.body;
        const entry = await findEntry(feedUrl);
        return {
            found: entry !== undefined,
            subscriptions: entry
                ? entry.subscriptions.map(subscriptionToJson)
                : []
        };
    }));

    router.post('/getData', wrap(async() => ({
        data: toFeedsJson(await core.listFeeds())
    })));

    router.post('/removeExpired', wrap(async() => ({
        result: await core.removeExpired()
    })));

    return router;
}

module.exports = { createTestController };
