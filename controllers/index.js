const express = require('express'),
    jsonStore = require('../services/json-store'),
    router = new express.Router();

router.use('/', require('./home'));
router.use('/docs', require('./docs'));
router.use('/pleaseNotify', require('./please-notify'));
router.use('/pleaseNotifyForm', require('./please-notify-form'));
router.use('/ping', require('./ping'));
router.use('/pingForm', require('./ping-form'));
router.use('/viewLog', require('./view-log'));
router.use('/RPC2', require('./rpc2'));

router.get('/subscriptions.json', (req, res) => {
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(jsonStore.getData(), null, 2));
});

module.exports = router;
