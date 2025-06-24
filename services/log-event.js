const logEmitter = require('./log-emitter'),
    moment = require('moment'),
    mongodb = require('./mongodb');

async function logEvent(eventtype, htmltext, startticks, req) {
    let secs, time;

    time = moment();
    secs = (parseInt(time.format('x'), 10) - parseInt(startticks, 10)) / 1000;

    if (undefined === req) {
        req = { headers: false };
    }

    const res = await mongodb.get('rsscloud')
        .collection('events')
        .insertOne({
            eventtype,
            htmltext,
            secs,
            time: new Date(time.utc().format()),
            headers: JSON.stringify(req.headers)
        });

    logEmitter.emit('logged-event', JSON.stringify({
        'id': res.insertedId.toHexString(),
        'eventtype': eventtype,
        'htmltext': htmltext,
        'secs': secs,
        'time': new Date(time.utc().format()),
        'headers': req.headers
    }));
}

module.exports = logEvent;
