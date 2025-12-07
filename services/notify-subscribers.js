const config = require('../config'),
    getDayjs = require('./dayjs-wrapper'),
    logEvent = require('./log-event'),
    mongodb = require('./mongodb'),
    notifyOne = require('./notify-one');

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

async function notifyOneSubscriber(resourceUrl, subscription) {
    const dayjs = await getDayjs();
    const apiurl = subscription.url,
        startticks = dayjs().format('x'),
        notifyProcedure = subscription.notifyProcedure,
        protocol = subscription.protocol;

    try {
        await notifyOne(notifyProcedure, apiurl, protocol, resourceUrl);

        subscription.ctUpdates += 1;
        subscription.ctConsecutiveErrors = 0;
        subscription.whenLastUpdate = new Date(dayjs().utc().format());

        await logEvent(
            'Notify',
            {
                subscriberUrl: apiurl,
                notifyProcedure: notifyProcedure,
                protocol: protocol,
                resourceUrl: resourceUrl,
                subscription: {
                    totalUpdates: subscription.ctUpdates,
                    consecutiveErrors: subscription.ctConsecutiveErrors,
                    totalErrors: subscription.ctErrors
                }
            },
            startticks
        );
    } catch (err) {
        console.error(err.message);

        subscription.ctErrors += 1;
        subscription.ctConsecutiveErrors += 1;
        subscription.whenLastError = new Date(dayjs().utc().format());

        await logEvent(
            'NotifyFailed',
            {
                subscriberUrl: apiurl,
                notifyProcedure: notifyProcedure,
                protocol: protocol,
                resourceUrl: resourceUrl,
                subscription: {
                    totalUpdates: subscription.ctUpdates,
                    consecutiveErrors: subscription.ctConsecutiveErrors,
                    totalErrors: subscription.ctErrors
                },
                error: err.message
            },
            startticks
        );
    }
}

async function filterSubscribers(subscription) {
    const dayjs = await getDayjs();
    if (dayjs().isAfter(subscription.whenExpires)) {
        return false;
    }

    if (subscription.ctConsecutiveErrors >= config.maxConsecutiveErrors) {
        return false;
    }

    return true;
}

async function notifySubscribers(resourceUrl) {
    const subscriptions = await fetchSubscriptions(resourceUrl);

    const validSubscriptions = [];
    for (const subscription of subscriptions.pleaseNotify) {
        if (await filterSubscribers(subscription)) {
            validSubscriptions.push(subscription);
        }
    }

    await Promise.all(validSubscriptions.map(notifyOneSubscriber.bind(null, resourceUrl)));

    await upsertSubscriptions(subscriptions);

}

module.exports = notifySubscribers;
