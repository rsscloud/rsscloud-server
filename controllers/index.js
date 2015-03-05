"use strict";

var express = require('express');
var router = express.Router();

router.use('/pleaseNotify', require('./please-notify'));
router.use('/ping', require('./ping'));
router.use('/pingForm', require('./ping-form'));
router.use('/viewLog', require('./view-log'));

module.exports = router;
