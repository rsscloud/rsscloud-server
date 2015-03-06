(function () {
    "use strict";

    var moment = require('moment');

    function logEvent(data, eventtype, htmltext, startticks) {
        var secs, time;

        time = moment();
        secs = (parseInt(time.format('x'), 10) - parseInt(startticks, 10)) / 1000;

        data.eventlog.unshift({
            'eventtype': eventtype,
            'htmltext': htmltext,
            'secs': secs,
            'time': time
        });

        while (data.prefs.maxEvents < data.eventlog.length) {
            data.eventlog.pop();
        }

        data.dirty = true;
    }

    module.exports = logEvent;
}());
