const appMessages = require('./app-messages'),
    config = require('../config'),
    ErrorResponse = require('./error-response'),
    initSubscription = require('./init-subscription'),
    logEvent = require('./log-event'),
    moment = require('moment'),
    mongodb = require('./mongodb'),
    notifyOne = require('./notify-one'),
    notifyOneChallenge = require('./notify-one-challenge'),
    sprintf = require('sprintf-js').sprintf,
    url = require('url');

async function checkresourceUrlStatusCode(resourceUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout);

    try {
        const res = await fetch(resourceUrl, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.status < 200 || res.status > 299) {
            throw new ErrorResponse(sprintf(appMessages.error.subscription.readResource, resourceUrl));
        }
    } catch {
        clearTimeout(timeoutId);
        throw new ErrorResponse(sprintf(appMessages.error.subscription.readResource, resourceUrl));
    }
}

async function fetchSubscriptions(resourceUrl) {
    const subscriptions = await mongodb.get('rsscloud')
        .collection('subscriptions')
        .findOne({
            _id: resourceUrl
        });

    return subscriptions || { _id: resourceUrl, pleaseNotify: [] };
}

async function upsertSubscriptions(subscriptions) {
    await mongodb.get('rsscloud')
        .collection('subscriptions')
        .replaceOne(
            { _id: subscriptions._id },
            subscriptions,
            { upsert: true }
        );
}

async function notifyApiUrl(notifyProcedure, apiurl, protocol, resourceUrl, diffDomain) {
    const subscriptions = await fetchSubscriptions(resourceUrl),
        startticks = moment().format('x'),
        parts = url.parse(apiurl);

    initSubscription(subscriptions, notifyProcedure, apiurl, protocol);

    try {
        if (diffDomain) {
            await notifyOneChallenge(notifyProcedure, apiurl, protocol, resourceUrl);
        } else {
            await notifyOne(notifyProcedure, apiurl, protocol, resourceUrl);
        }

        const index = subscriptions.pleaseNotify.findIndex(subscription => {
            return subscription.url === apiurl;
        });

        subscriptions.pleaseNotify[index].ctUpdates += 1;
        subscriptions.pleaseNotify[index].ctConsecutiveErrors = 0;
        subscriptions.pleaseNotify[index].whenLastUpdate = new Date(moment().utc().format());
        subscriptions.pleaseNotify[index].whenExpires = moment().utc().add(config.ctSecsResourceExpire, 'seconds').format();

        await upsertSubscriptions(subscriptions);

        await logEvent(
            'Subscribe',
            sprintf(appMessages.log.subscription, apiurl, parts.host, resourceUrl, parts.protocol),
            startticks
        );
    } catch (err) {
        console.dir(err);
        throw new ErrorResponse(appMessages.error.subscription.failedHandler);
    }
}

async function pleaseNotify(notifyProcedure, apiurl, protocol, urlList, diffDomain) {
    if (0 === urlList.length) {
        throw new ErrorResponse(appMessages.error.subscription.noResources);
    }

    let lastErr, resourceUrl;

    for (resourceUrl of urlList) {
        try {
            await checkresourceUrlStatusCode(resourceUrl);
            await notifyApiUrl(notifyProcedure, apiurl, protocol, resourceUrl, diffDomain);
        } catch (err) {
            lastErr = err;
        }
    }

    if (lastErr) {
        throw lastErr;
    }

    return {
        'success': true,
        'msg': appMessages.success.subscription
    };
}

module.exports = pleaseNotify;
