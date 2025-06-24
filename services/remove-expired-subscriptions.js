// TODO: Rewrite for mongodb

const moment = require('moment');

function checkSubscription(data, resourceUrl, apiurl) {
    const subscription = data.subscriptions[resourceUrl][apiurl];
    if (moment(subscription.whenExpires).isBefore(moment())) {
        delete data.subscriptions[resourceUrl][apiurl];
    } else if (subscription.ctConsecutiveErrors > data.prefs.maxConsecutiveErrors) {
        delete data.subscriptions[resourceUrl][apiurl];
    }
}

function scanApiUrls(data, resourceUrl) {
    const subscriptions = data.subscriptions[resourceUrl];
    for (const apiurl in subscriptions) {
        if (Object.prototype.hasOwnProperty.call(subscriptions, apiurl)) {
            checkSubscription(data, resourceUrl, apiurl);
        }
    }
    if (0 === subscriptions.length) {
        delete data.subscriptions[resourceUrl];
    }
}

function scanResources(data) {
    for (const resourceUrl in data.subscriptions) {
        if (Object.prototype.hasOwnProperty.call(data.subscriptions, resourceUrl)) {
            scanApiUrls(data, resourceUrl);
        }
    }
}

function removeExpiredSubscriptions(data) {
    scanResources(data);
}

module.exports = removeExpiredSubscriptions;
