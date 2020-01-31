(function () {
    "use strict";

    const config = require('../config'),
        moment = require('moment');

    function initSubscription(subscriptions, notifyProcedure, apiurl, protocol) {
        const defaultSubscription = {
            ctUpdates: 0,
            whenLastUpdate: moment.utc('0', 'x').format(),
            ctErrors: 0,
            ctConsecutiveErrors: 0,
            whenLastError: moment.utc('0', 'x').format(),
            whenExpires: moment().utc().add(config.ctSecsResourceExpire, 'seconds').format(),
            url: apiurl,
            notifyProcedure,
            protocol
        };

        const index = subscriptions.pleaseNotify.findIndex(subscription => {
            return subscription.url === apiurl;
        });

        if (-1 === index) {
            subscriptions.pleaseNotify.push(defaultSubscription);
        } else {
            subscriptions.pleaseNotify[index] = Object.assign(
                {},
                defaultSubscription,
                subscriptions.pleaseNotify[index]
            );
        }

        return subscriptions;
    }

    module.exports = initSubscription;
}());
