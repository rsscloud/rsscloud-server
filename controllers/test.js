const express = require('express'),
    jsonStore = require('../services/json-store'),
    mongodb = require('../services/mongodb'),
    router = new express.Router();

router.post('/reseed', async(req, res) => {
    try {
        jsonStore.clear();
        const db = mongodb.get('rsscloud');
        const resources = await db.collection('resources').find({}).toArray();
        const subscriptions = await db.collection('subscriptions').find({}).toArray();

        for (const resource of resources) {
            jsonStore.setResource(resource._id, resource);
        }

        for (const sub of subscriptions) {
            jsonStore.setSubscriptions(sub._id, sub.pleaseNotify || []);
        }

        jsonStore.flush();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
