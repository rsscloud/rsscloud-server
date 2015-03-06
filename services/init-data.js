(function () {
    "use strict";

    function initData(data) {
        var dirty;

        if (undefined === data.eventlog) {
            data.eventlog = [];
            dirty = true;
        }

        if (undefined === data.resources) {
            data.resources = {};
            dirty = true;
        }

        if (undefined === data.prefs) {
            data.prefs = {};
            dirty = true;
        }
        if (undefined === data.prefs.maxConsecutiveErrors) {
            data.prefs.maxConsecutiveErrors = 3;
            dirty = true;
        }
        if (undefined === data.prefs.maxResourceSize) {
            data.prefs.maxResourceSize = 1024 * 250; // 250K
            dirty = true;
        }
        if (undefined === data.prefs.ctSecsResourceExpire) {
            data.prefs.ctSecsResourceExpire = 25 * 60 * 60; // 25 Hours
            dirty = true;
        }
        if (undefined === data.prefs.minSecsBetweenPings) {
            data.prefs.minSecsBetweenPings = 0;
            dirty = true;
        }
        if (undefined === data.prefs.maxEvents) {
            data.prefs.maxEvents = 100;
            dirty = true;
        }

        if (undefined === data.subscriptions) {
            data.subscriptions = {};
            dirty = true;
        }

        if (true === dirty) {
            data.dirty = true;
        }

        return data;
    }

    module.exports = initData;
}());
