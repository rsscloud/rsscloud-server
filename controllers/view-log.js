
const ErrorResponse = require('../services/error-response'),
    errorResult = require('../services/error-result'),
    express = require('express'),
    logEmitter = require('../services/log-emitter'),
    mongodb = require('../services/mongodb'),
    router = new express.Router();

async function fetchVals(db, callback) {
    const vals = {
            'eventlog': []
        },

        res = await mongodb.get('rsscloud')
            .collection('events')
            .find()
            .sort({ time: -1 })
            .limit(1000)
            .toArray();

    vals.eventlog = res.map(item => {
        item.id = item._id.toHexString();
        delete item._id;

        item.headers = JSON.parse(item.headers);

        return item;
    });

    return vals;
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

function handleError(req, res, err) {
    if (!(err instanceof ErrorResponse)) {
        console.error(err);
    }
    processResponse(req, res, errorResult(err.message));
}

router.get('/', function (req, res) {
    fetchVals()
        .then(vals => processResponse(req, res, vals))
        .catch(err => handleError(req, res, err));
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
