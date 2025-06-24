// TODO: Rewrite for mongodb

const getDayjs = require('./dayjs-wrapper');

async function checkSubscription(data, resourceUrl, apiurl) {
    const dayjs = await getDayjs();
    const subscription = data.subscriptions[resourceUrl][apiurl];
    if (dayjs(subscription.whenExpires).isBefore(dayjs())) {
        delete data.subscriptions[resourceUrl][apiurl];
    } else if (subscription.ctConsecutiveErrors > data.prefs.maxConsecutiveErrors) {
        delete data.subscriptions[resourceUrl][apiurl];
    }
}

async function scanApiUrls(data, resourceUrl) {
    const subscriptions = data.subscriptions[resourceUrl];
    for (const apiurl in subscriptions) {
        if (Object.prototype.hasOwnProperty.call(subscriptions, apiurl)) {
            await checkSubscription(data, resourceUrl, apiurl);
        }
    }
    if (0 === subscriptions.length) {
        delete data.subscriptions[resourceUrl];
    }
}

async function scanResources(data) {
    for (const resourceUrl in data.subscriptions) {
        if (Object.prototype.hasOwnProperty.call(data.subscriptions, resourceUrl)) {
            await scanApiUrls(data, resourceUrl);
        }
    }
}

async function removeExpiredSubscriptions(data) {
    await scanResources(data);
}

module.exports = removeExpiredSubscriptions;
