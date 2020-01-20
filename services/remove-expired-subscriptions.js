(function () {
    "use strict";

    // TODO: Rewrite for mongodb

    var moment = require('moment');

    function checkSubscription(data, resourceUrl, apiurl) {
        var subscription;
        subscription = data.subscriptions[resourceUrl][apiurl];
        if (moment(subscription.whenExpires).isBefore(moment())) {
            delete data.subscriptions[resourceUrl][apiurl];
        } else if (subscription.ctConsecutiveErrors > data.prefs.maxConsecutiveErrors) {
            delete data.subscriptions[resourceUrl][apiurl];
        }
    }

    function scanApiUrls(data, resourceUrl) {
        var apiurl, subscriptions;
        subscriptions = data.subscriptions[resourceUrl];
        for (apiurl in subscriptions) {
            if (subscriptions.hasOwnProperty(apiurl)) {
                checkSubscription(data, resourceUrl, apiurl);
            }
        }
        if (0 === subscriptions.length) {
            delete data.subscriptions[resourceUrl];
        }
    }

    function scanResources(data) {
        var resourceUrl;
        for (resourceUrl in data.subscriptions) {
            if (data.subscriptions.hasOwnProperty(resourceUrl)) {
                scanApiUrls(data, resourceUrl);
            }
        }
    }

    function removeExpiredSubscriptions(data) {
        scanResources(data);
    }

    module.exports = removeExpiredSubscriptions;
}());
