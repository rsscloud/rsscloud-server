const config = require('../config'),
    initSubscription = require('../services/init-subscription'),
    mongodb = require('../services/mongodb');

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

module.exports = {
    addSubscription: async function(resourceUrl, notifyProcedure, apiurl, protocol) {
        const subscriptions = await fetchSubscriptions(resourceUrl);

        await initSubscription(subscriptions, notifyProcedure, apiurl, protocol);
        await upsertSubscriptions(subscriptions);

        let index = subscriptions.pleaseNotify.findIndex(subscription => {
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
            await upsertSubscriptions(subscriptions);
            return subscriptions.pleaseNotify[index];
        }

        throw Error(`Cannot find ${subscription.url} subscription`);
    },
    before: async function() {
        await mongodb.connect('rsscloud', config.mongodbUri);
        console.log('    → MongoDB \'rsscloud\' Database Connected');
    },
    after: async function() {
        return mongodb.close('rsscloud');
    },
    beforeEach: async function() {
        await mongodb.get('rsscloud').createCollection('events');
        await mongodb.get('rsscloud').createCollection('resources');
        await mongodb.get('rsscloud').createCollection('subscriptions');
    },
    afterEach: async function() {
        await mongodb.get('rsscloud').collection('events').drop();
        await mongodb.get('rsscloud').collection('resources').drop();
        await mongodb.get('rsscloud').collection('subscriptions').drop();
    }
};
