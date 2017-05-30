(function () {
    "use strict";

    var async = require('async'),
        data = require('../services/data'),
        errorResult = require('../services/error-result'),
        express = require('express'),
        router = express.Router();

    function fetchData(db, callback) {
        var data = {
            'eventlog': []
        };

        db.serialize(function() {
            db.each("SELECT * FROM log_events ORDER BY time DESC LIMIT 100", function(err, row) {
                row.headers = JSON.parse(row.headers);
                data.eventlog.push(row);
            }, function () {
                callback(null, data);
            });
        });
    }

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
        processResponse(req, res, errorResult(errorMessage));
    }

    router.get('/', function (req, res) {
        async.waterfall([
            function (callback) {
                data.getDb(callback);
            },
            function (db, callback) {
                fetchData(db, callback);
            },
            function (data) {
                processResponse(req, res, data);
            }
        ], function (errorMessage) {
            handleError(req, res, errorMessage);
        });
    });

    module.exports = router;
}());
