"use strict";

var express = require('express');
var router = express.Router();

router.use('/pleaseNotify', require('./please-notify'));

module.exports = router;
