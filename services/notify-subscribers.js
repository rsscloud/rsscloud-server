(function () {
    "use strict";

    const appMessages = require('./app-messages'),
        logEvent = require('./log-event'),
        moment = require('moment'),
        mongodb = require('./mongodb'),
        notifyOne = require('./notify-one'),
        sprintf = require('sprintf-js').sprintf,
        url = require('url');

    async function fetchSubscriptions(resourceUrl) {
        const subscriptions = await mongodb.get()
            .collection('subscriptions')
            .findOne({
                _id: resourceUrl
            });

        return subscriptions || { _id: resourceUrl };
    }

    async function upsertSubscriptions(subscriptions) {
        await mongodb.get()
            .collection('subscriptions')
            .replaceOne(
                { _id: subscriptions._id },
                subscriptions,
                { upsert: true }
            );
    }

    async function notifySubscribers(resourceUrl) {
        const subscriptions = await fetchSubscriptions(resourceUrl);
        let apiurl;

        for (apiurl of Object.keys(subscriptions)) {
            const startticks = moment().format('x'),
                parts = url.parse(apiurl);

            if ('_id' === apiurl) {
                continue;
            }

            try {
                await notifyOne(resourceUrl, apiurl);

                subscriptions[apiurl].ctUpdates += 1;
                subscriptions[apiurl].ctConsecutiveErrors = 0;
                subscriptions[apiurl].whenLastUpdate = moment().utc().format();

                await logEvent(
                    'Notify',
                    sprintf(appMessages.log.notify, apiurl, parts.host, resourceUrl, parts.protocol),
                    startticks
                );
            } catch (err) {
                subscriptions[apiurl].ctErrors += 1;
                subscriptions[apiurl].ctConsecutiveErrors += 1;
                subscriptions[apiurl].whenLastError = moment().utc().format();

                await logEvent(
                    'NotifyFailed',
                    sprintf(appMessages.log.notifyFailed, apiurl, parts.host, resourceUrl, parts.protocol),
                    startticks
                );
            }
        }

        upsertSubscriptions(subscriptions);
    }

    module.exports = notifySubscribers;
}());
