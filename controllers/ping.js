(function () {
    "use strict";

    var async = require('async'),
        bodyParser = require('body-parser'),
        errorResult = require('../services/error-result'),
        express = require('express'),
        parsePingParams = require('../services/parse-ping-params'),
        ping = require('../services/ping'),
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

    function handleError(req, res, errorMessage) {
        processResponse(req, res, errorResult(errorMessage));
    }

    router.post('/', urlencodedParser, function (req, res) {
        var url;
        async.waterfall([
            function (callback) {
                parsePingParams(req, callback);
            },
            function (params, callback) {
                url = params.url;
                callback(null);
            },
            function (callback) {
                syncStruct.watchStruct('data', callback);
            },
            function (data, callback) {
                ping(
                    data,
                    url,
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
