(function () {
    "use strict";

    var data = require('./data'),
        moment = require('moment');

    function logEvent(deprecated, eventtype, htmltext, startticks, req) {
        var secs, time;

        time = moment();
        secs = (parseInt(time.format('x'), 10) - parseInt(startticks, 10)) / 1000;

        if (undefined === req) {
            req = {headers: false};
        }

        data.getDb(function (err, db) {
            if (err) {
                console.error(err);
                return;
            }

            db.serialize(function() {

                var stmt = db.prepare(`
                    INSERT INTO log_events (
                        eventtype,
                        htmltext,
                        secs,
                        time,
                        headers
                    ) VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    )
                `);

                stmt.run(eventtype, htmltext, secs, time.toISOString(), JSON.stringify(req.headers));

            });
        });
    }

    module.exports = logEvent;
}());
