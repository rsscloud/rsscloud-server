(function () {
    "use strict";

    var async = require('async'),
        data = require('../services/data'),
        errorResult = require('../services/error-result'),
        express = require('express'),
        logEmitter = require('../services/log-emitter'),
        router = express.Router();

    function fetchVals(db, id, callback) {
        var vals = {
            'eventlog': []
        };

        db.serialize(function() {
            db.each("SELECT * FROM log_events ORDER BY time DESC LIMIT 1000", function(err, row) {
                row.headers = JSON.parse(row.headers);
                vals.eventlog.push(row);
            }, function () {
                callback(null, vals);
            });
        });
    }

    function processResponse(req, res, vals) {
        switch (req.accepts('html', 'json')) {
        case 'html':
            vals.wshost = res.app.locals.host + ':' + res.app.locals.port;
            res.render('view-log', vals);
            break;
        case 'json':
            res.json(vals.eventlog);
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
                fetchVals(db, 0, callback);
            },
            function (vals) {
                processResponse(req, res, vals);
            }
        ], function (errorMessage) {
            handleError(req, res, errorMessage);
        });
    });

    router.ws('/', function(ws, req) {
        var id = 0;

        function sendLogEvent(logEvent) {
            ws.send(logEvent);
        };

        logEmitter.on('logged-event', sendLogEvent);

        ws.on('close', function () {
            logEmitter.removeListener('logged-event', sendLogEvent);
        });
    });

    module.exports = router;
}());
