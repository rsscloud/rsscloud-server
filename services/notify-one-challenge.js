(function () {
    "use strict";

    var appMessages = require('./app-messages'),
        getRandomPassword = require('./get-random-password'),
        initSubscription = require('./init-subscription'),
        moment = require('moment'),
        querystring = require('querystring'),
        request = require('request');

    function notifyOneChallenge(data, resourceUrl, apiurl, callback) {
        var challenge, subscription, testUrl;
        callback = callback || function () { return; };

        subscription = initSubscription(data, resourceUrl, apiurl);

        challenge = getRandomPassword(20);
        testUrl = apiurl + '?' + querystring.stringify({
            'url': resourceUrl,
            'challenge': challenge
        });

        request.get({
            'url': testUrl
        }, function (err, res, body) {
            if (err || res.statusCode < 200 || res.statusCode > 299 || body !== challenge) {
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
            return callback(null);
        });
    }

    module.exports = notifyOneChallenge;
}());
