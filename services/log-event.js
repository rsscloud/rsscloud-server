const getDayjs = require('./dayjs-wrapper'),
    websocket = require('./websocket');

async function logEvent(eventtype, htmltext, startticks, req) {
    const dayjs = await getDayjs();
    let secs, time;

    time = dayjs();
    secs = (parseInt(time.format('x'), 10) - parseInt(startticks, 10)) / 1000;

    if (undefined === req) {
        req = { headers: false };
    }

    websocket.broadcast({
        eventtype,
        htmltext,
        secs,
        time: new Date(time.utc().format()),
        headers: req.headers
    });
}

module.exports = logEvent;
