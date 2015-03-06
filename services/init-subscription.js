(function () {
    "use strict";

    var moment = require('moment');

    function initSubscription(data, resourceUrl, apiurl) {
        var dirty = false, subscriptions, subscription;

        if (undefined === data.subscriptions[resourceUrl]) {
            data.subscriptions[resourceUrl] = {};
            dirty = true;
        }
        subscriptions = data.subscriptions[resourceUrl];

        if (undefined === subscriptions[apiurl]) {
            subscriptions[apiurl] = {};
            dirty = true;
        }
        subscription = subscriptions[apiurl];

        if (undefined === subscription.ctUpdates) {
            subscription.ctUpdates = 0;
            dirty = true;
        }
        if (undefined === subscription.whenLastUpdate) {
            subscription.whenLastUpdate = moment('0', 'x');
            dirty = true;
        }
        if (undefined === subscription.ctErrors) {
            subscription.ctErrors = 0;
            dirty = true;
        }
        if (undefined === subscription.ctConsecutiveErrors) {
            subscription.ctConsecutiveErrors = 0;
            dirty = true;
        }
        if (undefined === subscription.whenLastError) {
            subscription.whenLastError = moment('0', 'x');
            dirty = true;
        }
        if (undefined === subscription.whenExpires) {
            subscription.whenExpires = moment().add(data.prefs.ctSecsResourceExpire, 'seconds');
            dirty = true;
        }

        if (true === dirty) {
            data.dirty = true;
        }

        return subscription;
    }

    module.exports = initSubscription;
}());
