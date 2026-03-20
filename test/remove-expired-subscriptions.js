const chai = require('chai'),
    config = require('../config'),
    expect = chai.expect,
    getDayjs = require('../services/dayjs-wrapper'),
    jsonStore = require('../services/json-store'),
    mock = require('./mock'),
    mongodb = require('./mongodb'),
    removeExpiredSubscriptions = require('../services/remove-expired-subscriptions');

describe('RemoveExpiredSubscriptions', function() {

    before(async function() {
        await mongodb.before();
        await mock.before();
    });

    after(async function() {
        await mongodb.after();
        await mock.after();
    });

    beforeEach(async function() {
        await mongodb.beforeEach();
        await mock.beforeEach();
    });

    afterEach(async function() {
        await mongodb.afterEach();
        await mock.afterEach();
    });

    it('should remove expired subscriptions', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            pingPath = '/feedupdated',
            apiurl = mock.serverUrl + pingPath,
            dayjs = await getDayjs();

        const subscription = await mongodb.addSubscription(resourceUrl, false, apiurl, 'http-post');
        subscription.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await mongodb.updateSubscription(resourceUrl, subscription);

        await removeExpiredSubscriptions();

        const doc = await mongodb.findSubscription(resourceUrl);
        expect(doc).to.be.null;
    });

    it('should remove resource when all subscriptions are removed', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            pingPath = '/feedupdated',
            apiurl = mock.serverUrl + pingPath,
            dayjs = await getDayjs();

        // Add subscription and resource
        const subscription = await mongodb.addSubscription(resourceUrl, false, apiurl, 'http-post');
        subscription.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await mongodb.updateSubscription(resourceUrl, subscription);

        await mongodb.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 0,
            whenLastCheck: new Date(dayjs().utc().subtract(48, 'hours').format())
        });
        jsonStore.setResource(resourceUrl, { lastHash: 'abc', lastSize: 100 });
        jsonStore.setSubscriptions(resourceUrl, [subscription]);

        await removeExpiredSubscriptions();

        // Subscription document should be gone
        const subDoc = await mongodb.findSubscription(resourceUrl);
        expect(subDoc).to.be.null;

        // Resource document should also be gone (last checked 48 hours ago)
        const resDoc = await mongodb.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = jsonStore.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });

    it('should remove recently-checked resource when all subscriptions are removed', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            pingPath = '/feedupdated',
            apiurl = mock.serverUrl + pingPath,
            dayjs = await getDayjs();

        // Add subscription and recently-checked resource
        const subscription = await mongodb.addSubscription(resourceUrl, false, apiurl, 'http-post');
        subscription.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await mongodb.updateSubscription(resourceUrl, subscription);

        await mongodb.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 0,
            whenLastCheck: new Date(dayjs().utc().subtract(1, 'hour').format())
        });
        jsonStore.setResource(resourceUrl, { lastHash: 'abc', lastSize: 100 });
        jsonStore.setSubscriptions(resourceUrl, [subscription]);

        await removeExpiredSubscriptions();

        // Subscription document should be gone
        const subDoc = await mongodb.findSubscription(resourceUrl);
        expect(subDoc).to.be.null;

        // Resource document should also be gone
        const resDoc = await mongodb.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = jsonStore.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });

    it('should not remove resource when valid subscriptions remain', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            pingPath1 = '/feedupdated1',
            pingPath2 = '/feedupdated2',
            apiurl1 = mock.serverUrl + pingPath1,
            apiurl2 = mock.serverUrl + pingPath2,
            dayjs = await getDayjs();

        // Add two subscriptions - one expired, one valid
        const subscription1 = await mongodb.addSubscription(resourceUrl, false, apiurl1, 'http-post');
        subscription1.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await mongodb.updateSubscription(resourceUrl, subscription1);

        await mongodb.addSubscription(resourceUrl, false, apiurl2, 'http-post');

        // Add resource
        await mongodb.addResource(resourceUrl, {
            lastHash: 'abc', lastSize: 100, ctChecks: 1, ctUpdates: 0
        });

        await removeExpiredSubscriptions();

        // Subscription document should still exist with valid subscription
        const subDoc = await mongodb.findSubscription(resourceUrl);
        expect(subDoc).to.not.be.null;
        expect(subDoc.pleaseNotify).to.have.lengthOf(1);
        expect(subDoc.pleaseNotify[0].url).to.equal(apiurl2);

        // Resource document should still exist
        const resDoc = await mongodb.findResource(resourceUrl);
        expect(resDoc).to.not.be.null;
    });

    it('should remove subscription document with empty pleaseNotify array', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath;

        // Directly insert a subscription doc with empty pleaseNotify
        await mongodb.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 0,
            whenLastCheck: new Date()
        });
        const db = require('../services/mongodb').get('rsscloud');
        await db.collection('subscriptions').insertOne({ _id: resourceUrl, pleaseNotify: [] });
        jsonStore.setResource(resourceUrl, { lastHash: 'abc', lastSize: 100 });
        jsonStore.setSubscriptions(resourceUrl, []);

        await removeExpiredSubscriptions();

        // Both documents should be removed
        const subDoc = await mongodb.findSubscription(resourceUrl);
        expect(subDoc).to.be.null;

        const resDoc = await mongodb.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = jsonStore.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });

    it('should remove orphaned resource with no subscription document', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            dayjs = await getDayjs();

        // Add resource but no subscription document (last checked 48 hours ago)
        await mongodb.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 0,
            whenLastCheck: new Date(dayjs().utc().subtract(48, 'hours').format())
        });
        jsonStore.setResource(resourceUrl, { lastHash: 'abc', lastSize: 100 });

        await removeExpiredSubscriptions();

        // Resource document should be removed
        const resDoc = await mongodb.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = jsonStore.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });


});
