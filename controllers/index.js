const express = require('express'),
    jsonStore = require('../services/json-store'),
    mongodb = require('../services/mongodb'),
    router = new express.Router();

router.use('/', require('./home'));
router.use('/docs', require('./docs'));
router.use('/pleaseNotify', require('./please-notify'));
router.use('/pleaseNotifyForm', require('./please-notify-form'));
router.use('/ping', require('./ping'));
router.use('/pingForm', require('./ping-form'));
router.use('/viewLog', require('./view-log'));
router.use('/RPC2', require('./rpc2'));
router.use('/stats', require('./stats'));

router.get('/stats.json', (req, res) => {
    const { getStats } = require('../services/stats');
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(getStats(), null, 2));
});

router.get('/subscriptions.json', (req, res) => {
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(jsonStore.getData(), null, 2));
});

router.post('/admin/reseed', async(req, res) => {
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
