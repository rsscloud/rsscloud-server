const express = require('express'),
    { core, store } = require('../core'),
    {
        resourceToJson,
        resourceFromJson,
        subscriptionToJson,
        subscriptionFromJson
    } = require('@rsscloud/core'),
    { toFeedsJson } = require('../services/feeds-json'),
    createRemoveExpiredSubscriptions = require('../services/remove-expired-subscriptions'),
    router = new express.Router();

const removeExpiredSubscriptions = createRemoveExpiredSubscriptions({ core });

console.warn(
    '[test-api] ENABLE_TEST_API=true — /test/* endpoints are mounted. Never enable in production.'
);

router.use(express.json());

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

router.post('/clear', async(req, res) => {
    try {
        for (const { feedUrl } of await store.list()) {
            await store.remove(feedUrl);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/setResource', async(req, res) => {
    try {
        const { feedUrl, resource } = req.body;
        await store.putResource(feedUrl, resourceFromInput(feedUrl, resource));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/getResource', async(req, res) => {
    try {
        const { feedUrl } = req.body;
        const resource = await store.getResource(feedUrl);
        res.json({
            success: true,
            found: resource !== null,
            resource: resource !== null ? resourceToJson(resource) : null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/setSubscriptions', async(req, res) => {
    try {
        const { feedUrl, subscriptions } = req.body;
        await store.putSubscriptions(
            feedUrl,
            subscriptions.map(subscriptionFromJson)
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/getSubscriptions', async(req, res) => {
    try {
        const { feedUrl } = req.body;
        const entry = (await store.list()).find(e => e.feedUrl === feedUrl);
        res.json({
            success: true,
            found: entry !== undefined,
            subscriptions: entry
                ? entry.subscriptions.map(subscriptionToJson)
                : []
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/getData', async(req, res) => {
    try {
        res.json({ success: true, data: toFeedsJson(await store.list()) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/removeExpired', async(req, res) => {
    try {
        const result = await removeExpiredSubscriptions();
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
