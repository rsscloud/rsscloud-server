(function () {
    "use strict";

    var appMessage = require('./app-messages'),
        async = require('async'),
        crypto = require('crypto'),
        initData = require('./init-data'),
        initResource = require('./init-resource'),
        logEvent = require('./log-event'),
        moment = require('moment'),
        notifySubscribers = require('./notify-subscribers'),
        request = require('request'),
        sprintf = require('sprintf-js').sprintf;

    function checkPingFrequency(data, resource, callback) {
        var ctsecs, minsecs;
        minsecs = data.prefs.minSecsBetweenPings;
        if (0 < minsecs) {
            ctsecs = moment().diff(resource.whenLastCheck, 'seconds');
            if (ctsecs < minsecs) {
                return callback(sprintf(appMessage.error.ping.tooRecent, minsecs, ctsecs));
            }
        }
        callback(null);
    }

    function md5Hash(value) {
        var md5 = crypto.createHash('md5');
        md5.update(value);
        return md5.digest('hex');
    }

    function checkForResourceChange(data, resource, resourceUrl, startticks, callback) {
        resource.ctChecks += 1;
        resource.whenLastCheck = moment();
        request.get({
            'url': resourceUrl
        }, function (err, res, body) {
            var hash;
            if (err || res.statusCode < 200 || res.statusCode > 299) {
                callback(sprintf(appMessage.error.ping.readResource, resourceUrl));
            }
            hash = md5Hash(body);
            if (resource.lastHash !== hash) {
                resource.flDirty = true;
            } else if (resource.lastSize !== body.length) {
                resource.flDirty = true;
            } else {
                resource.flDirty = false;
            }
            resource.lastHash = hash;
            resource.lastSize = body.length;
            logEvent(
                data,
                'Ping',
                sprintf(appMessage.log.ping, resourceUrl, resource.flDirty.toString()),
                startticks
            );
            callback(null);
        });
    }

    function notifySubscribersIfDirty(data, resource, resourceUrl, callback) {
        if (resource.flDirty) {
            resource.ctUpdates += 1;
            resource.whenLastUpdate = moment();
            return notifySubscribers(data, resourceUrl, callback);
        }
        callback(null);
    }

    function ping(data, resourceUrl, callback) {
        var resource,
            startticks = moment().format('x');

        async.waterfall([
            function (callback) {
                initData(data);
                resource = initResource(data, resourceUrl);
                callback(null);
            },
            function (callback) {
                checkPingFrequency(data, resource, callback);
            },
            function (callback) {
                checkForResourceChange(data, resource, resourceUrl, startticks, callback);
            },
            function (callback) {
                notifySubscribersIfDirty(data, resource, resourceUrl, callback);
            },
            function finished() {
                data.dirty = true;
                return callback(null, {
                    'success': true,
                    'msg': appMessage.success.ping
                });
            }
        ], function handleError(err) {
            data.dirty = true;
            return callback(err);
        });
    }

    module.exports = ping;
}());
