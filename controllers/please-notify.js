"use strict";

var async = require('async');
var bodyParser = require('body-parser');
var express = require('express');
var router = express.Router();
var rssCloudSuite = require('../services/suite');
var urlencodedParser = bodyParser.urlencoded({ extended: false });

function checkParams(req, callback) {
    var key,
        s = '',
        params = {
            'urlList': []
        },
        parts = {};

    for (key in req.body) {
        if (req.body.hasOwnProperty(key) && 0 === key.toLowerCase().indexOf('url')) {
            params.urlList.push(req.body[key]);
        }
    }

    if (undefined === req.body.domain) {
        parts.client = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        params.diffDomain = false;
    } else {
        parts.client = req.body.domain;
        params.diffDomain = true;
    }
    if (undefined === req.body.port) {
        s += 'port, ';
    }
    if (undefined === req.body.path) {
        s += 'path, ';
    }
    if (undefined === req.body.protocol) {
        s += 'protocol, ';
    }
    if (0 === s.length) {
        parts.scheme = 'http';
        parts.port = req.body.port;
        parts.path = req.body.path;
        parts.protocol = req.body.protocol;
        rssCloudSuite.glueUrlParts(
            parts.scheme,
            parts.client,
            parts.port,
            parts.path,
            parts.protocol,
            function (errorMessage, apiurl) {
                if (errorMessage) {
                    callback(errorMessage);
                }
                params.apiurl = apiurl;
                callback(null, params);
            }
        );
    } else {
        s = s.substr(0, s.length - 2);
        callback('The following parameters were missing from the request body: ' + s + '.');
    }
}

function pleaseNotify(params, callback) {
    rssCloudSuite.pleaseNotify(
        params.apiurl,
        params.urlList,
        params.diffDomain,
        callback
    );
}

function processResponse(req, res, result) {
    switch (req.accepts('xml', 'json')) {
    case 'xml':
        res.set('Content-Type', 'text/xml');
        res.send(rssCloudSuite.restReturnSuccess(
            result.success,
            result.msg,
            'notifyResult'
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

function handleError(req, res, errorMessage) {
    processResponse(req, res, rssCloudSuite.errorResult(errorMessage));
}

router.post('/', urlencodedParser, function (req, res) {
    async.waterfall([
        function (callback) {
            checkParams(req, callback);
        },
        function (params, callback) {
            pleaseNotify(params, callback);
        },
        function (result) {
            processResponse(req, res, result);
        }
    ], function (errorMessage) {
        handleError(req, res, errorMessage);
    });
});

module.exports = router;
