(function () {
    "use strict";

    var appMessage = require('./app-messages'),
        async = require('async'),
        initData = require('./init-data'),
        initSubscription = require('./init-subscription'),
        logEvent = require('./log-event'),
        moment = require('moment'),
        notifyOne = require('./notify-one'),
        notifyOneChallenge = require('./notify-one-challenge'),
        request = require('request'),
        sprintf = require('sprintf-js').sprintf,
        url = require('url');

    function checkresourceUrlStatusCodes(urlList, callback) {
        async.each(
            urlList,
            function (resourceUrl, callback) {
                request({
                    'url': resourceUrl,
                    'method': 'HEAD'
                }, function checkStatusCode(err, res) {
                    if (err || res.statusCode < 200 || res.statusCode > 299) {
                        return callback(sprintf(appMessage.error.subscription.readResource, resourceUrl));
                    }
                    return callback(null);
                });
            },
            callback
        );
    }

    function notifyApiUrl(data, resourceUrl, apiurl, diffDomain, callback) {
        if (diffDomain) {
            notifyOneChallenge(data, resourceUrl, apiurl, callback);
        } else {
            notifyOne(data, resourceUrl, apiurl, false, callback);
        }
    }

    function addSubscriber(data, resourceUrl, apiurl, parts, startticks, req, callback) {
        var subscription;
        subscription = initSubscription(data, resourceUrl, apiurl);
        subscription.whenExpires = moment().add(data.prefs.ctSecsResourceExpire, 'seconds');
        logEvent(
            data,
            'Subscribe',
            sprintf(appMessage.log.subscription, apiurl, parts.host, resourceUrl, parts.protocol),
            startticks,
            req
        );
        return callback(null);
    }

    function pleaseNotify(data, apiurl, urlList, diffDomain, req, callback) {
        var parts, startticks = moment().format('x');
        parts = url.parse(apiurl);

        async.waterfall([
            function (callback) {
                initData(data);
                callback(null);
            },
            function (callback) {
                checkresourceUrlStatusCodes(urlList, callback);
            },
            function (callback) {
                if (undefined === urlList[0]) {
                    return callback(appMessage.error.subscription.noResources);
                }
                notifyApiUrl(data, urlList[0], apiurl, diffDomain, callback);
            },
            function (callback) {
                async.each(
                    urlList,
                    function (resourceUrl, callback) {
                        addSubscriber(data, resourceUrl, apiurl, parts, startticks, req, callback);
                    },
                    callback
                );
            },
            function () {
                return callback(null, {
                    'success': true,
                    'msg': appMessage.success.subscription
                });
            }
        ], function handleError(err) {
            return callback(err);
        });
    }

    module.exports = pleaseNotify;
}());
