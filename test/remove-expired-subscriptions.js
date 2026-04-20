const chai = require('chai'),
    config = require('../config'),
    expect = chai.expect,
    getDayjs = require('../services/dayjs-wrapper'),
    mock = require('./mock'),
    storeApi = require('./store-api');

describe('RemoveExpiredSubscriptions', function() {

    before(async function() {
        await storeApi.before();
        await mock.before();
    });

    after(async function() {
        await storeApi.after();
        await mock.after();
    });

    beforeEach(async function() {
        await storeApi.beforeEach();
        await mock.beforeEach();
    });

    afterEach(async function() {
        await storeApi.afterEach();
        await mock.afterEach();
    });

    it('should remove expired subscriptions', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            pingPath = '/feedupdated',
            apiurl = mock.serverUrl + pingPath,
            dayjs = await getDayjs();

        const subscription = await storeApi.addSubscription(resourceUrl, false, apiurl, 'http-post');
        subscription.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await storeApi.updateSubscription(resourceUrl, subscription);

        await storeApi.removeExpired();

        const doc = await storeApi.findSubscription(resourceUrl);
        expect(doc).to.be.null;
    });

    it('should remove resource when all subscriptions are removed', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            pingPath = '/feedupdated',
            apiurl = mock.serverUrl + pingPath,
            dayjs = await getDayjs();

        // Add subscription and resource
        const subscription = await storeApi.addSubscription(resourceUrl, false, apiurl, 'http-post');
        subscription.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await storeApi.updateSubscription(resourceUrl, subscription);

        await storeApi.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 0,
            whenLastCheck: new Date(dayjs().utc().subtract(48, 'hours').format())
        });

        await storeApi.removeExpired();

        // Subscription document should be gone
        const subDoc = await storeApi.findSubscription(resourceUrl);
        expect(subDoc).to.be.null;

        // Resource document should also be gone (last checked 48 hours ago)
        const resDoc = await storeApi.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = await storeApi.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });

    it('should remove resource when all subscriptions are removed and whenLastUpdate is absent', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            pingPath = '/feedupdated',
            apiurl = mock.serverUrl + pingPath,
            dayjs = await getDayjs();

        const subscription = await storeApi.addSubscription(resourceUrl, false, apiurl, 'http-post');
        subscription.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await storeApi.updateSubscription(resourceUrl, subscription);

        await storeApi.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 0,
            whenLastCheck: new Date(dayjs().utc().subtract(1, 'hour').format())
        });

        await storeApi.removeExpired();

        // Subscription document should be gone
        const subDoc = await storeApi.findSubscription(resourceUrl);
        expect(subDoc).to.be.null;

        // Resource document should also be gone
        const resDoc = await storeApi.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = await storeApi.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });

    it('should retain empty-subscribers entry when whenLastUpdate is within retention window', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            dayjs = await getDayjs();

        const recentUpdate = new Date(dayjs().utc().subtract(1, 'day').format());

        await storeApi.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 1,
            whenLastUpdate: recentUpdate
        });
        await storeApi.setSubscriptions(resourceUrl, []);

        await storeApi.removeExpired();

        // Resource should still exist
        const resDoc = await storeApi.findResource(resourceUrl);
        expect(resDoc).to.not.be.null;

        // JSON store entry should still exist with empty subscribers
        const storeData = await storeApi.getData();
        expect(storeData).to.have.property(resourceUrl);
        expect(storeData[resourceUrl].subscribers).to.deep.equal([]);
    });

    it('should remove empty-subscribers entry when whenLastUpdate is beyond retention window', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            dayjs = await getDayjs();

        const staleUpdate = new Date(dayjs().utc().subtract(config.feedsChangedWindowDays + 1, 'days').format());

        await storeApi.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 1,
            whenLastUpdate: staleUpdate
        });
        await storeApi.setSubscriptions(resourceUrl, []);

        await storeApi.removeExpired();

        // Resource should be gone
        const resDoc = await storeApi.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = await storeApi.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });

    it('should retain entry when last subscription expires but whenLastUpdate is recent', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            pingPath = '/feedupdated',
            apiurl = mock.serverUrl + pingPath,
            dayjs = await getDayjs();

        const recentUpdate = new Date(dayjs().utc().subtract(1, 'day').format());

        const subscription = await storeApi.addSubscription(resourceUrl, false, apiurl, 'http-post');
        subscription.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await storeApi.updateSubscription(resourceUrl, subscription);

        await storeApi.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 1,
            whenLastUpdate: recentUpdate
        });

        await storeApi.removeExpired();

        // Subscription document should still exist with empty pleaseNotify
        const subDoc = await storeApi.findSubscription(resourceUrl);
        expect(subDoc).to.not.be.null;
        expect(subDoc.pleaseNotify).to.deep.equal([]);

        // Resource document should still exist
        const resDoc = await storeApi.findResource(resourceUrl);
        expect(resDoc).to.not.be.null;

        // JSON store entry should still exist with empty subscribers
        const storeData = await storeApi.getData();
        expect(storeData).to.have.property(resourceUrl);
        expect(storeData[resourceUrl].subscribers).to.deep.equal([]);
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
        const subscription1 = await storeApi.addSubscription(resourceUrl, false, apiurl1, 'http-post');
        subscription1.whenExpires = dayjs().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
        await storeApi.updateSubscription(resourceUrl, subscription1);

        await storeApi.addSubscription(resourceUrl, false, apiurl2, 'http-post');

        // Add resource
        await storeApi.addResource(resourceUrl, {
            lastHash: 'abc', lastSize: 100, ctChecks: 1, ctUpdates: 0
        });

        await storeApi.removeExpired();

        // Subscription document should still exist with valid subscription
        const subDoc = await storeApi.findSubscription(resourceUrl);
        expect(subDoc).to.not.be.null;
        expect(subDoc.pleaseNotify).to.have.lengthOf(1);
        expect(subDoc.pleaseNotify[0].url).to.equal(apiurl2);

        // Resource document should still exist
        const resDoc = await storeApi.findResource(resourceUrl);
        expect(resDoc).to.not.be.null;
    });

    it('should remove subscription document with empty pleaseNotify array', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath;

        await storeApi.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 0,
            whenLastCheck: new Date()
        });
        await storeApi.setSubscriptions(resourceUrl, []);

        await storeApi.removeExpired();

        // Both documents should be removed
        const subDoc = await storeApi.findSubscription(resourceUrl);
        expect(subDoc).to.be.null;

        const resDoc = await storeApi.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = await storeApi.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });

    it('should remove orphaned resource with no subscription document', async function() {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            dayjs = await getDayjs();

        // Add resource but no subscription document (last checked 48 hours ago)
        await storeApi.addResource(resourceUrl, {
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 1,
            ctUpdates: 0,
            whenLastCheck: new Date(dayjs().utc().subtract(48, 'hours').format())
        });

        await storeApi.removeExpired();

        // Resource document should be removed
        const resDoc = await storeApi.findResource(resourceUrl);
        expect(resDoc).to.be.null;

        // JSON store entry should be fully removed
        const storeData = await storeApi.getData();
        expect(storeData).to.not.have.property(resourceUrl);
    });

});
