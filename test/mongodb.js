const config = require("../config"),
	initSubscription = require('../services/init-subscription'),
	moment = require('moment'),
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
	addSubscription: async function (resourceUrl, notifyProcedure, apiurl, protocol) {
		const subscriptions = await fetchSubscriptions(resourceUrl);
		initSubscription(subscriptions, notifyProcedure, apiurl, protocol);
		await upsertSubscriptions(subscriptions);
	},
	before: async function () {
		const db = await mongodb.connect('rsscloud', config.mongodbUri)

		console.log(`    → MongoDB 'rsscloud' Database Connected`);

		return db;
	},
	after: async function () {
		return mongodb.close('rsscloud');
	},
	beforeEach: async function () {
		await mongodb.get('rsscloud').createCollection('events');
		await mongodb.get('rsscloud').createCollection('resources');
		await mongodb.get('rsscloud').createCollection('subscriptions');
	},
	afterEach: async function () {
		await mongodb.get('rsscloud').collection('events').drop();
		await mongodb.get('rsscloud').collection('resources').drop();
		await mongodb.get('rsscloud').collection('subscriptions').drop();
	}
};
