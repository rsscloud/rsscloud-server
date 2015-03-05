"use strict";

var express = require('express');
var router = express.Router();
var safefs = require('../services/safefs');

router.get('/', function (req, res) {
    safefs.watchStruct('data', function (errorMessage, data) {
        if (errorMessage) {
            return res.send(errorMessage);
        }
        res.render('view-log', data);
    });
});

module.exports = router;
