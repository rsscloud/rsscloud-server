(function () {
    "use strict";

    var async = require('async'),
        bodyParser = require('body-parser'),
        errorResult = require('../services/error-result'),
        express = require('express'),
        parseNotifyParams = require('../services/parse-notify-params'),
        pleaseNotify = require('../services/please-notify'),
        restReturnSuccess = require('../services/rest-return-success'),
        router = express.Router(),
        syncStruct = require('../services/sync-struct'),
        urlencodedParser = bodyParser.urlencoded({ extended: false });

    function processResponse(req, res, result) {
        switch (req.accepts('xml', 'json')) {
            case 'xml':
                res.set('Content-Type', 'text/xml');
                res.send(restReturnSuccess(
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
        processResponse(req, res, errorResult(errorMessage));
    }

    router.post('/', urlencodedParser, function (req, res) {
        var apiurl, diffDomain, urlList;
        async.waterfall([
            function (callback) {
                parseNotifyParams(req, callback);
            },
            function (params, callback) {
                apiurl = params.apiurl;
                diffDomain = params.diffDomain;
                urlList = params.urlList;
                callback(null);
            },
            function (callback) {
                syncStruct.watchStruct('data', callback);
            },
            function (data, callback) {
                pleaseNotify(
                    data,
                    apiurl,
                    urlList,
                    diffDomain,
                    req,
                    callback
                );
            },
            function (result) {
                processResponse(req, res, result);
            }
        ], function (errorMessage) {
            handleError(req, res, errorMessage);
        });
    });

    module.exports = router;
}());
