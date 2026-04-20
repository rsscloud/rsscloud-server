const express = require('express'),
    jsonStore = require('../services/json-store'),
    removeExpiredSubscriptions = require('../services/remove-expired-subscriptions'),
    router = new express.Router();

console.warn('[test-api] ENABLE_TEST_API=true — /test/* endpoints are mounted. Never enable in production.');

router.use(express.json());

router.post('/clear', (req, res) => {
    try {
        jsonStore.clear();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/setResource', (req, res) => {
    try {
        const { feedUrl, resource } = req.body;
        jsonStore.setResource(feedUrl, resource);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/getResource', (req, res) => {
    try {
        const { feedUrl } = req.body;
        const resource = jsonStore.getResource(feedUrl);
        res.json({ success: true, found: resource !== null, resource });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/setSubscriptions', (req, res) => {
    try {
        const { feedUrl, pleaseNotify } = req.body;
        jsonStore.setSubscriptions(feedUrl, pleaseNotify);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/getSubscriptions', (req, res) => {
    try {
        const { feedUrl } = req.body;
        const data = jsonStore.getData();
        const found = Object.prototype.hasOwnProperty.call(data, feedUrl) && Array.isArray(data[feedUrl].subscribers);
        const subscriptions = jsonStore.getSubscriptions(feedUrl);
        res.json({ success: true, found, subscriptions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/getData', (req, res) => {
    try {
        res.json({ success: true, data: jsonStore.getData() });
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
