const express = require('express'),
    { core, store } = require('../core'),
    {
        toCoreResource,
        toLegacyResource,
        toCoreSubscription,
        toLegacySubscription,
        toLegacyData
    } = require('../services/legacy-store-shape'),
    createRemoveExpiredSubscriptions = require('../services/remove-expired-subscriptions'),
    router = new express.Router();

const removeExpiredSubscriptions = createRemoveExpiredSubscriptions({ core });

console.warn(
    '[test-api] ENABLE_TEST_API=true — /test/* endpoints are mounted. Never enable in production.'
);

router.use(express.json());

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
        await store.putResource(feedUrl, toCoreResource(feedUrl, resource));
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
            resource:
                resource !== null
                    ? { _id: feedUrl, ...toLegacyResource(resource) }
                    : null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/setSubscriptions', async(req, res) => {
    try {
        const { feedUrl, pleaseNotify } = req.body;
        await store.putSubscriptions(feedUrl, pleaseNotify.map(toCoreSubscription));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/getSubscriptions', async(req, res) => {
    try {
        const { feedUrl } = req.body;
        const entry = (await store.list()).find(e => e.feedUrl === feedUrl);
        const pleaseNotify = entry
            ? entry.subscriptions.map(toLegacySubscription)
            : [];
        res.json({
            success: true,
            found: entry !== undefined,
            subscriptions: { _id: feedUrl, pleaseNotify }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/getData', async(req, res) => {
    try {
        res.json({ success: true, data: toLegacyData(await store.list()) });
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
