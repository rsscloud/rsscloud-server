const chai = require('chai'),
    chaiHttp = require('chai-http'),
    expect = chai.expect,
    SERVER_URL = process.env.APP_URL || 'http://localhost:5337',
    mock = require('./mock'),
    storeApi = require('./store-api');

chai.use(chaiHttp);

// Send a WebSub hub request as a urlencoded form body. URLSearchParams keeps the
// dotted hub.* keys literal so the server's body parser sees hub.mode etc.
function hubRequest(params) {
    return chai
        .request(SERVER_URL)
        .post('/websub')
        .set('content-type', 'application/x-www-form-urlencoded')
        .send(new URLSearchParams(params).toString());
}

// Intent verification is async (the hub answers 202, then verifies out of band),
// so the test polls the store until the websub subscription appears or times out.
async function waitForWebSubSubscription(
    topicUrl,
    { timeoutMs = 5000, intervalMs = 100 } = {}
) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const subscriptions = (await storeApi.findSubscription(topicUrl)) || [];
        const websub = subscriptions.find(
            subscription => subscription.protocol === 'websub'
        );
        if (websub) {
            return websub;
        }
        if (Date.now() >= deadline) {
            return null;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
}

describe('WebSub subscribe', function() {
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

    it('accepts a subscribe, verifies the callback, and records the subscription', async function() {
        const feedPath = '/websub-feed.xml',
            topicUrl = mock.serverUrl + feedPath,
            callbackPath = '/websub-callback',
            callbackUrl = mock.serverUrl + callbackPath;

        mock.route('GET', feedPath, 200, '<RSS Feed />');
        // Challenge-echo: answer the intent-verification GET by echoing hub.challenge.
        mock.route('GET', callbackPath, 200, req => req.query['hub.challenge']);

        const res = await hubRequest({
            'hub.mode': 'subscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl
        });

        expect(res).status(202);

        const subscription = await waitForWebSubSubscription(topicUrl);
        expect(subscription, 'websub subscription should be recorded').to.not.be
            .null;
        expect(subscription.url).to.equal(callbackUrl);
        expect(subscription.protocol).to.equal('websub');

        // The hub performed the intent-verification GET on the callback.
        expect(mock.requests.GET)
            .property(callbackPath)
            .lengthOf(1, `Missing verification GET ${callbackPath}`);
    });

    it('does not record the subscription when the callback refuses to echo', async function() {
        const feedPath = '/websub-feed.xml',
            topicUrl = mock.serverUrl + feedPath,
            callbackPath = '/websub-refuse',
            callbackUrl = mock.serverUrl + callbackPath;

        mock.route('GET', feedPath, 200, '<RSS Feed />');
        // Refuse: answer the verification GET without echoing the challenge.
        mock.route('GET', callbackPath, 200, 'not-the-challenge');

        const res = await hubRequest({
            'hub.mode': 'subscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl
        });

        // Still 202 — validation is synchronous, verification is not.
        expect(res).status(202);

        const subscription = await waitForWebSubSubscription(topicUrl, {
            timeoutMs: 2000
        });
        expect(
            subscription,
            'subscription must not be recorded without a valid echo'
        ).to.be.null;

        // The hub still attempted verification.
        expect(mock.requests.GET)
            .property(callbackPath)
            .lengthOf(1, `Missing verification GET ${callbackPath}`);
    });

    it('rejects a hub.* body missing callback and topic with 400', async function() {
        const res = await hubRequest({ 'hub.mode': 'subscribe' });
        expect(res).status(400);
    });

    it('rejects an unsupported hub.mode with 400', async function() {
        const res = await hubRequest({
            'hub.mode': 'publish',
            'hub.callback': mock.serverUrl + '/websub-callback',
            'hub.topic': mock.serverUrl + '/websub-feed.xml'
        });
        expect(res).status(400);
    });
});
