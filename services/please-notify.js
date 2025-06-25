const appMessages = require('./app-messages'),
    config = require('../config'),
    ErrorResponse = require('./error-response'),
    getDayjs = require('./dayjs-wrapper'),
    initSubscription = require('./init-subscription'),
    logEvent = require('./log-event'),
    mongodb = require('./mongodb'),
    notifyOne = require('./notify-one'),
    notifyOneChallenge = require('./notify-one-challenge'),
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
            throw new ErrorResponse(appMessages.error.subscription.readResource(resourceUrl));
        }
    } catch {
        clearTimeout(timeoutId);
        throw new ErrorResponse(appMessages.error.subscription.readResource(resourceUrl));
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
    const dayjs = await getDayjs();
    const subscriptions = await fetchSubscriptions(resourceUrl),
        startticks = dayjs().format('x'),
        parts = url.parse(apiurl);

    await initSubscription(subscriptions, notifyProcedure, apiurl, protocol);

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
        subscriptions.pleaseNotify[index].whenLastUpdate = new Date(dayjs().utc().format());
        subscriptions.pleaseNotify[index].whenExpires = dayjs().utc().add(config.ctSecsResourceExpire, 'seconds').format();

        await upsertSubscriptions(subscriptions);

        await logEvent(
            'Subscribe',
            appMessages.log.subscription(apiurl, parts.host, resourceUrl, parts.protocol),
            startticks
        );
    } catch {
        throw new ErrorResponse(appMessages.error.subscription.failedHandler);
    }
}

async function pleaseNotify(notifyProcedure, apiurl, protocol, urlList, diffDomain) {
    if (0 === urlList.length) {
        throw new ErrorResponse(appMessages.error.subscription.noResources);
    }

    const results = await Promise.allSettled(
        urlList.map(async(resourceUrl) => {
            await checkresourceUrlStatusCode(resourceUrl);
            await notifyApiUrl(notifyProcedure, apiurl, protocol, resourceUrl, diffDomain);
        })
    );

    // Check if all operations failed
    const rejectedResults = results.filter(result => result.status === 'rejected');
    if (rejectedResults.length === results.length && rejectedResults.length > 0) {
        // If all operations failed, throw the last error
        throw rejectedResults[rejectedResults.length - 1].reason;
    }

    return {
        'success': true,
        'msg': appMessages.success.subscription
    };
}

module.exports = pleaseNotify;
