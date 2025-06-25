
const ErrorResponse = require('../services/error-response'),
    errorResult = require('../services/error-result'),
    express = require('express'),
    getDayjs = require('../services/dayjs-wrapper'),
    mongodb = require('../services/mongodb'),
    router = new express.Router();

async function fetchVals(_db, _callback) {
    const dayjs = await getDayjs();
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

        // Format time for display (hour:minute AM/PM)
        item.time = dayjs(item.time).format('h:mmA');

        return item;
    });

    return vals;
}

function processResponse(req, res, vals) {
    switch (req.accepts('html', 'json')) {
    case 'html':
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

router.get('/', function(req, res) {
    fetchVals()
        .then(vals => processResponse(req, res, vals))
        .catch(err => handleError(req, res, err));
});

module.exports = router;
