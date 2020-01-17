(function () {
    "use strict";

    const appMessages = require('./app-messages'),
        config = require('../config'),
        initSubscription = require('./init-subscription'),
        logEvent = require('./log-event'),
        moment = require('moment'),
        mongodb = require('./mongodb'),
        notifyOne = require('./notify-one'),
        notifyOneChallenge = require('./notify-one-challenge'),
        Promise = require('bluebird'),
        request = require('request-promise'),
        sprintf = require('sprintf-js').sprintf,
        url = require('url');

    async function checkresourceUrlStatusCode(resourceUrl) {
        console.log(resourceUrl);
        return request({
            method: 'HEAD',
            uri: resourceUrl,
            followRedirect: false,
            resolveWithFullResponse: true
        })
            .then(res => {
                if (res.statusCode < 200 || res.statusCode > 299) {
                    throw new Error(sprintf(appMessages.error.subscription.readResource, resourceUrl));
                }
            })
            .catch(() => {
                throw new Error(sprintf(appMessages.error.subscription.readResource, resourceUrl));
            });
    }

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

    async function notifyApiUrl(resourceUrl, apiurl, diffDomain) {
        const subscriptions = await fetchSubscriptions(resourceUrl),
            startticks = moment().format('x'),
            parts = url.parse(apiurl);

        initSubscription(subscriptions, apiurl);

        try {
            if (diffDomain) {
                await notifyOneChallenge(resourceUrl, apiurl);
            } else {
                await notifyOne(resourceUrl, apiurl);
            }

            subscriptions[apiurl].ctUpdates += 1;
            subscriptions[apiurl].ctConsecutiveErrors = 0;
            subscriptions[apiurl].whenLastUpdate = moment().utc().format();
            subscriptions[apiurl].whenExpires = moment().utc().add(config.ctSecsResourceExpire, 'seconds').format();

            await upsertSubscriptions(subscriptions);

            await logEvent(
                'Subscribe',
                sprintf(appMessages.log.subscription, apiurl, parts.host, resourceUrl, parts.protocol),
                startticks
            );
        } catch (err) {
            console.dir(err);
            throw new Error(appMessages.error.subscription.failedHandler);
        }
    }

    async function pleaseNotify(apiurl, urlList, diffDomain) {
        if (0 === urlList.length) {
            throw new Error(appMessages.error.subscription.noResources);
        }

        let lastErr, resourceUrl;

        for (resourceUrl of urlList) {
            try {
                await checkresourceUrlStatusCode(resourceUrl);
                await notifyApiUrl(resourceUrl, apiurl, diffDomain);
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
}());
