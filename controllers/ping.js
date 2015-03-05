"use strict";

var async = require('async');
var bodyParser = require('body-parser');
var express = require('express');
var router = express.Router();
var rssCloudSuite = require('../services/suite');
var urlencodedParser = bodyParser.urlencoded({ extended: false });

function checkParams(req, callback) {
    var s = '', params = {};
    if (undefined === req.body.url) {
        s += 'url, ';
    }
    if (0 === s.length) {
        params.url = req.body.url;
        callback(null, params);
    } else {
        s = s.substr(0, s.length - 2);
        callback('The following parameters were missing from the request body: ' + s + '.');
    }
}

function processResponse(req, res, result) {
    switch (req.accepts('xml', 'json')) {
    case 'xml':
        res.set('Content-Type', 'text/xml');
        res.send(rssCloudSuite.restReturnSuccess(
            result.success,
            result.msg,
            'result'
        ));
        break;
    case 'json':
        res.json(result);
        break;
    default:
        res.status(406).send('Not Acceptable');
        break;
    }
}

function ping(params, callback) {
    rssCloudSuite.ping(
        params.url,
        callback
    );
}

function handleError(req, res, errorMessage) {
    processResponse(req, res, rssCloudSuite.errorResult(errorMessage));
}

router.post('/', urlencodedParser, function (req, res) {
    async.waterfall([
        function (callback) {
            checkParams(req, callback);
        },
        function (params, callback) {
            ping(params, callback);
        },
        function (result) {
            processResponse(req, res, result);
        }
    ], function (errorMessage) {
        handleError(req, res, errorMessage);
    });
});

module.exports = router;
