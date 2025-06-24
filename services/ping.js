const appMessage = require('./app-messages'),
    config = require('../config'),
    crypto = require('crypto'),
    ErrorResponse = require('./error-response'),
    initResource = require('./init-resource'),
    logEvent = require('./log-event'),
    moment = require('moment'),
    mongodb = require('./mongodb'),
    notifySubscribers = require('./notify-subscribers'),
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
    let body = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout);

    try {
        res = await fetch(resourceUrl, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.status >= 200 && res.status <= 299) {
            body = await res.text();
        }
    } catch {
        clearTimeout(timeoutId);
        res = { status: 404 };
    }

    resource.ctChecks += 1;
    resource.whenLastCheck = new Date(moment().utc().format());

    if (res.status < 200 || res.status > 299) {
        throw new ErrorResponse(sprintf(appMessage.error.ping.readResource, resourceUrl));
    }

    const hash = md5Hash(body);

    if (resource.lastHash !== hash) {
        resource.flDirty = true;
    } else if (resource.lastSize !== body.length) {
        resource.flDirty = true;
    } else {
        resource.flDirty = false;
    }

    resource.lastHash = hash;
    resource.lastSize = body.length;

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
        resource.whenLastUpdate = new Date(moment().utc().format());
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
