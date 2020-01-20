(function () {
    "use strict";

    const config = require('../config'),
        moment = require('moment');

    function initSubscription(subscriptions, apiurl) {
        const defaultSubscription = {
            ctUpdates: 0,
            whenLastUpdate: moment.utc('0', 'x').format(),
            ctErrors: 0,
            ctConsecutiveErrors: 0,
            whenLastError: moment.utc('0', 'x').format(),
            whenExpires: moment().utc().add(config.ctSecsResourceExpire, 'seconds').format()
        };

        subscriptions[apiurl] = Object.assign({}, defaultSubscription, subscriptions[apiurl]);

        return subscriptions;
    }

    module.exports = initSubscription;
}());
