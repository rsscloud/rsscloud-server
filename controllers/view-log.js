"use strict";

var async = require('async');
var express = require('express');
var router = express.Router();
var rssCloudSuite = require('../services/suite');
var safefs = require('../services/safefs');

function processResponse(req, res, data) {
    switch (req.accepts('html', 'json')) {
    case 'html':
        res.render('view-log', data);
        break;
    case 'json':
        res.json(data.eventlog);
        break;
    default:
        res.status(406).send('Not Acceptable');
        break;
    }
}

function handleError(req, res, errorMessage) {
    processResponse(req, res, rssCloudSuite.errorResult(errorMessage));
}

router.get('/', function (req, res) {
    async.waterfall([
        function (callback) {
            safefs.watchStruct('data', callback);
        },
        function (data) {
            console.log(data);
            processResponse(req, res, data);
        }
    ], function (errorMessage) {
        handleError(req, res, errorMessage);
    });
});

module.exports = router;
