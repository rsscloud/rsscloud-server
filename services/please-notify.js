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
        request = require('request-promise-native'),
        sprintf = require('sprintf-js').sprintf,
        url = require('url');

    async function checkresourceUrlStatusCode(resourceUrl) {
        return request({
            method: 'GET',
            uri: resourceUrl,
            followRedirect: true,
            maxRedirects: 3,
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
                await notifyOneChallenge(resourceUrl, apiurl);
            } else {
                await notifyOne(notifyProcedure, apiurl, protocol, resourceUrl);
            }

            const index = subscriptions.pleaseNotify.findIndex(subscription => {
                return subscription.url === apiurl;
            });

            subscriptions.pleaseNotify[index].ctUpdates += 1;
            subscriptions.pleaseNotify[index].ctConsecutiveErrors = 0;
            subscriptions.pleaseNotify[index].whenLastUpdate = moment().utc().format();
            subscriptions.pleaseNotify[index].whenExpires = moment().utc().add(config.ctSecsResourceExpire, 'seconds').format();

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

    async function pleaseNotify(notifyProcedure, apiurl, protocol, urlList, diffDomain) {
        if (0 === urlList.length) {
            throw new Error(appMessages.error.subscription.noResources);
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
}());
