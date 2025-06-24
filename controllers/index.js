const express = require('express'),
    router = new express.Router();

router.use('/', require('./home'));
router.use('/docs', require('./docs'));
router.use('/pleaseNotify', require('./please-notify'));
router.use('/pleaseNotifyForm', require('./please-notify-form'));
router.use('/ping', require('./ping'));
router.use('/pingForm', require('./ping-form'));
router.use('/viewLog', require('./view-log'));
router.use('/RPC2', require('./rpc2'));

module.exports = router;
