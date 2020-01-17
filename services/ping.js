(function () {
    "use strict";

    const appMessage = require('./app-messages'),
        async = require('async'),
        config = require('../config'),
        crypto = require('crypto'),
        initResource = require('./init-resource'),
        logEvent = require('./log-event'),
        moment = require('moment'),
        notifySubscribers = require('./notify-subscribers'),
        request = require('request-promise'),
        sprintf = require('sprintf-js').sprintf;

    function checkPingFrequency(resource) {
        let ctsecs, minsecs = config.minSecsBetweenPings;
        if (0 < minsecs) {
            ctsecs = moment().diff(resource.whenLastCheck, 'seconds');
            if (ctsecs < minsecs) {
                throw new Error(sprintf(appMessage.error.ping.tooRecent, minsecs, ctsecs));
            }
        }
    }

    function md5Hash(value) {
        return crypto.createHash('md5').update(value).digest('hex');
    }

    async function checkForResourceChange(resource, resourceUrl, startticks) {
        const res = await request({
            uri: resourceUrl,
            resolveWithFullResponse: true
        });
        let hash;

        resource.ctChecks += 1;
        resource.whenLastCheck = moment().utc().format();

        if (res.statusCode < 200 || res.statusCode > 299) {
            throw new Error(sprintf(appMessage.error.ping.readResource, resourceUrl));
        }
        hash = md5Hash(res.body);
        if (resource.lastHash !== hash) {
            resource.flDirty = true;
        } else if (resource.lastSize !== res.body.length) {
            resource.flDirty = true;
        } else {
            resource.flDirty = false;
        }
        resource.lastHash = hash;
        resource.lastSize = res.body.length;
        await logEvent(
            'Ping',
            sprintf(appMessage.log.ping, resourceUrl, resource.flDirty.toString()),
            startticks
        );
    }

    async function notifySubscribersIfDirty(resource, resourceUrl) {
        if (resource.flDirty) {
            resource.ctUpdates += 1;
            resource.whenLastUpdate = moment();
            return await notifySubscribers(resourceUrl);
        }
    }

    async function ping(resourceUrl) {
        const startticks = moment().format('x'),
            resource = await initResource(resourceUrl);
        checkPingFrequency(resource);
        await checkForResourceChange(resource, resourceUrl, startticks);
        await notifySubscribersIfDirty(resource, resourceUrl);
        return {
            'success': true,
            'msg': appMessage.success.ping
        };
    }

    module.exports = ping;
}());
