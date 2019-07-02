(function () {
    "use strict";

    var async = require('async'),
        data = require('../services/data'),
        errorResult = require('../services/error-result'),
        express = require('express'),
        logEmitter = require('../services/log-emitter'),
        router = new express.Router();

    function fetchVals(db, callback) {
        var vals = {
            'eventlog': []
        };

        db.serialize(() => {
            db.each("SELECT * FROM log_events ORDER BY time DESC LIMIT 1000", (err, row) => {
                row.headers = JSON.parse(row.headers);
                vals.eventlog.push(row);
            }, () => {
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
            (callback) => {
                data.getDb(callback);
            },
            (db, callback) => {
                fetchVals(db, callback);
            },
            (vals) => {
                processResponse(req, res, vals);
            }
        ], (errorMessage) => {
            handleError(req, res, errorMessage);
        });
    });

    router.ws('/', (ws, req) => {
        function sendLogEvent(logEvent) {
            ws.send(logEvent);
        }

        logEmitter.on('logged-event', sendLogEvent);

        ws.on('close', function () {
            logEmitter.removeListener('logged-event', sendLogEvent);
        });
    });

    module.exports = router;
}());
