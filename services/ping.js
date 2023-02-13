(function () {
    "use strict";

    const appMessage = require('./app-messages'),
        config = require('../config'),
        crypto = require('crypto'),
        ErrorResponse = require('./error-response'),
        initResource = require('./init-resource'),
        logEvent = require('./log-event'),
        moment = require('moment'),
        mongodb = require('./mongodb'),
        notifySubscribers = require('./notify-subscribers'),
        request = require('request-promise-native'),
        sprintf = require('sprintf-js').sprintf;

    function checkPingFrequency(resource) {
        let ctsecs, minsecs = config.minSecsBetweenPings;
        if (0 < minsecs) {
            ctsecs = moment().diff(resource.whenLastCheck, 'seconds');
            if (ctsecs < minsecs) {
                throw new ErrorResponse(sprintf(appMessage.error.ping.tooRecent, minsecs, ctsecs));
            }
        }
    }

    function md5Hash(value) {
        return crypto.createHash('md5').update(value).digest('hex');
    }

    async function checkForResourceChange(resource, resourceUrl, startticks) {
        let res;

        try {
            res = await request({
                method: 'GET',
                uri: resourceUrl,
                timeout: config.requestTimeout,
                followRedirect: true,
                maxRedirects: 3,
                resolveWithFullResponse: true
            });
        } catch (err) {
            res = { statusCode: 404 };
        }

        resource.ctChecks += 1;
        resource.whenLastCheck = moment().utc().format();

        if (res.statusCode < 200 || res.statusCode > 299) {
            throw new ErrorResponse(sprintf(appMessage.error.ping.readResource, resourceUrl));
        }

        const hash = md5Hash(res.body);

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

    async function fetchResource(resourceUrl) {
        const resource = await mongodb.get('rsscloud')
            .collection('resources')
            .findOne({
                _id: resourceUrl
            });

        return resource || { _id: resourceUrl };
    }

    async function upsertResource(resource) {
        await mongodb.get('rsscloud')
            .collection('resources')
            .replaceOne(
                { _id: resource._id },
                resource,
                { upsert: true }
            );
    }

    async function notifySubscribersIfDirty(resource, resourceUrl) {
        if (resource.flDirty) {
            resource.ctUpdates += 1;
            resource.whenLastUpdate = moment().utc().format();
            return await notifySubscribers(resourceUrl);
        }
    }

    async function ping(resourceUrl) {
        const startticks = moment().format('x'),
            resource = initResource(
                await fetchResource(resourceUrl)
            );

        checkPingFrequency(resource);
        await checkForResourceChange(resource, resourceUrl, startticks);
        await notifySubscribersIfDirty(resource, resourceUrl);
        await upsertResource(resource);

        return {
            'success': true,
            'msg': appMessage.success.ping
        };
    }

    module.exports = ping;
}());
