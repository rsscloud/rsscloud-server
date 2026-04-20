const appMessage = require('./app-messages'),
    config = require('../config'),
    crypto = require('crypto'),
    ErrorResponse = require('./error-response'),
    getDayjs = require('./dayjs-wrapper'),
    initResource = require('./init-resource'),
    jsonStore = require('./json-store'),
    logEvent = require('./log-event'),
    notifySubscribers = require('./notify-subscribers');

async function checkPingFrequency(resource) {
    let ctsecs, minsecs = config.minSecsBetweenPings;
    if (0 < minsecs) {
        const dayjs = await getDayjs();
        ctsecs = dayjs().diff(resource.whenLastCheck, 'seconds');
        if (ctsecs < minsecs) {
            throw new ErrorResponse(appMessage.error.ping.tooRecent(minsecs, ctsecs), 'PING_TOO_RECENT');
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

    const dayjs = await getDayjs();
    resource.ctChecks += 1;
    resource.whenLastCheck = new Date(dayjs().utc().format());

    if (res.status < 200 || res.status > 299) {
        throw new ErrorResponse(appMessage.error.ping.readResource(resourceUrl));
    }

    const hash = md5Hash(body);

    const changed = (resource.lastHash !== hash) || (resource.lastSize !== body.length);

    resource.lastHash = hash;
    resource.lastSize = body.length;

    await logEvent(
        'Ping',
        {
            resourceUrl: resourceUrl,
            changed: changed,
            hash: resource.lastHash,
            size: resource.lastSize,
            stats: {
                totalChecks: resource.ctChecks,
                totalUpdates: resource.ctUpdates
            }
        },
        startticks
    );

    return changed;
}

function fetchResource(resourceUrl) {
    return jsonStore.getResource(resourceUrl) || { _id: resourceUrl };
}

function upsertResource(resource) {
    jsonStore.setResource(resource._id, resource);
}

async function notifySubscribersIfDirty(changed, resource, resourceUrl) {
    if (changed) {
        const dayjs = await getDayjs();
        resource.ctUpdates += 1;
        resource.whenLastUpdate = new Date(dayjs().utc().format());
        return await notifySubscribers(resourceUrl);
    }
}

async function ping(resourceUrl) {
    const dayjs = await getDayjs();
    const startticks = dayjs().format('x'),
        resource = await initResource(
            await fetchResource(resourceUrl)
        );

    await checkPingFrequency(resource);
    const changed = await checkForResourceChange(resource, resourceUrl, startticks);
    await notifySubscribersIfDirty(changed, resource, resourceUrl);
    upsertResource(resource);

    return {
        'success': true,
        'msg': appMessage.success.ping
    };
}

module.exports = ping;
