const initSubscription = require('../services/init-subscription');

const SERVER_URL = process.env.APP_URL || 'http://localhost:5337';

async function postJson(path, body) {
    const res = await fetch(`${SERVER_URL}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {})
    });
    const data = await res.json();
    if (!data.success) {
        throw new Error(`POST ${path} failed: ${data.error}`);
    }
    return data;
}

async function fetchSubscriptions(resourceUrl) {
    const { subscriptions } = await postJson('/test/getSubscriptions', { feedUrl: resourceUrl });
    return subscriptions;
}

async function setSubscriptions(resourceUrl, pleaseNotify) {
    await postJson('/test/setSubscriptions', { feedUrl: resourceUrl, pleaseNotify });
}

module.exports = {
    addResource: async function(resourceUrl, resourceObj) {
        await postJson('/test/setResource', { feedUrl: resourceUrl, resource: resourceObj });
    },
    findResource: async function(resourceUrl) {
        const { found, resource } = await postJson('/test/getResource', { feedUrl: resourceUrl });
        return found ? resource : null;
    },
    findSubscription: async function(resourceUrl) {
        const { found, subscriptions } = await postJson('/test/getSubscriptions', { feedUrl: resourceUrl });
        return found ? subscriptions : null;
    },
    addSubscription: async function(resourceUrl, notifyProcedure, apiurl, protocol) {
        const subscriptions = await fetchSubscriptions(resourceUrl);

        await initSubscription(subscriptions, notifyProcedure, apiurl, protocol);
        await setSubscriptions(resourceUrl, subscriptions.pleaseNotify);

        const index = subscriptions.pleaseNotify.findIndex(subscription => {
            return subscription.url === apiurl;
        });

        if (-1 !== index) {
            return subscriptions.pleaseNotify[index];
        }

        throw Error(`Cannot find ${apiurl} subscription`);
    },
    updateSubscription: async function(resourceUrl, subscription) {
        const subscriptions = await fetchSubscriptions(resourceUrl),
            index = subscriptions.pleaseNotify.findIndex(match => {
                return subscription.url === match.url;
            });

        if (-1 !== index) {
            subscriptions.pleaseNotify[index] = subscription;
            await setSubscriptions(resourceUrl, subscriptions.pleaseNotify);
            return subscriptions.pleaseNotify[index];
        }

        throw Error(`Cannot find ${subscription.url} subscription`);
    },
    setSubscriptions,
    getData: async function() {
        const { data } = await postJson('/test/getData', {});
        return data;
    },
    removeExpired: async function() {
        const { result } = await postJson('/test/removeExpired', {});
        return result;
    },
    before: async function() {},
    after: async function() {},
    beforeEach: async function() {},
    afterEach: async function() {
        await postJson('/test/clear', {});
    }
};
