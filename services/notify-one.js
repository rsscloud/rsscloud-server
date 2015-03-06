(function () {
    "use strict";

    var appMessages = require('./app-messages'),
        initSubscription = require('./init-subscription'),
        logEvent = require('./log-event'),
        moment = require('moment'),
        request = require('request'),
        sprintf = require('sprintf-js').sprintf,
        url = require('url');

    function notifyOne(data, resourceUrl, apiurl, flLog, callback) {
        var startticks = moment().format('x'), subscription;
        flLog = flLog || false;
        callback = callback || function () { return; };

        subscription = initSubscription(data, resourceUrl, apiurl);

        request.post({
            'url': apiurl,
            'form': {'url': resourceUrl}
        }, function (err, res) {
            var parts = url.parse(apiurl);

            if (err || res.statusCode < 200 || res.statusCode > 299) {
                subscription.ctErrors += 1;
                subscription.ctConsecutiveErrors += 1;
                subscription.whenLastError = moment();
                data.dirty = true;
                return callback(appMessages.error.subscription.failedHandler);
            }

            subscription.whenLastUpdate = moment();
            subscription.ctUpdates += 1;
            subscription.ctConsecutiveErrors = 0;
            data.dirty = true;

            if (flLog) {
                logEvent(
                    data,
                    'Notify',
                    sprintf(appMessages.log.notify, apiurl, parts.host, resourceUrl, parts.protocol),
                    startticks
                );
            }

            return callback(null);
        });
    }

    module.exports = notifyOne;
}());
