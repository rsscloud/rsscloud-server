const chai = require('chai'),
    chaiHttp = require('chai-http'),
    crypto = require('node:crypto'),
    expect = chai.expect,
    getDayjs = require('./helpers/dayjs-wrapper'),
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

// A WebSub publish is acknowledged with 202 and the topic re-fetched out of
// band, so the test polls the mock for the content-distribution POST.
async function waitForDeliveryPost(
    callbackPath,
    { timeoutMs = 5000, intervalMs = 100 } = {}
) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const posts = mock.requests.POST[callbackPath] || [];
        if (posts.length > 0) {
            return posts[0];
        }
        if (Date.now() >= deadline) {
            return null;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
}

// Unsubscribe is async too (202, then a verification GET, then removal), so the
// test polls until the websub subscription is gone or the timeout lapses.
async function waitForWebSubUnsubscription(
    topicUrl,
    { timeoutMs = 5000, intervalMs = 100 } = {}
) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const subscriptions = (await storeApi.findSubscription(topicUrl)) || [];
        const websub = subscriptions.find(
            subscription => subscription.protocol === 'websub'
        );
        if (!websub) {
            return true;
        }
        if (Date.now() >= deadline) {
            return false;
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
            'hub.mode': 'bogus',
            'hub.callback': mock.serverUrl + '/websub-callback',
            'hub.topic': mock.serverUrl + '/websub-feed.xml'
        });
        expect(res).status(400);
    });
});

describe('WebSub cross-protocol fan-out', function() {
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

    // The headline use case: a publisher who only speaks rssCloud keeps pinging
    // as today, and a single /ping fans the changed feed out to BOTH an rssCloud
    // subscriber (a notify) and a WebSub subscriber (the feed body) — no
    // hub.mode=publish involved.
    it('fans one rssCloud ping out to both an rssCloud and a WebSub subscriber', async function() {
        const feedPath = '/cross-feed.xml',
            topicUrl = mock.serverUrl + feedPath,
            websubCallbackPath = '/cross-websub-callback',
            websubCallbackUrl = mock.serverUrl + websubCallbackPath,
            restNotifyPath = '/cross-rest-notify',
            restNotifyUrl = mock.serverUrl + restNotifyPath,
            initialFeed = '<rss>version-1</rss>',
            changedFeed = '<rss>version-2-changed</rss>';

        // The topic feed starts at version 1.
        mock.route('GET', feedPath, 200, initialFeed);
        // WebSub callback: echo the challenge on the verification GET, and
        // accept the content distribution on the POST.
        mock.route('GET', websubCallbackPath, 200, req => {
            return req.query['hub.challenge'];
        });
        mock.route('POST', websubCallbackPath, 200, 'ok');
        // The rssCloud subscriber's notify endpoint.
        mock.route('POST', restNotifyPath, 200, 'Thanks for the update! :-)');

        // Subscribe via WebSub and wait for the async handshake to record it.
        // (core pre-pings the topic here, recording version 1's hash; no
        // subscribers exist yet, so that pre-ping fans out to no one.)
        const subRes = await hubRequest({
            'hub.mode': 'subscribe',
            'hub.callback': websubCallbackUrl,
            'hub.topic': topicUrl
        });
        expect(subRes).status(202);

        const websubSub = await waitForWebSubSubscription(topicUrl);
        expect(websubSub, 'websub subscription should be recorded').to.not.be
            .null;

        // Add an rssCloud REST subscriber on the SAME topic.
        await storeApi.addSubscription(
            topicUrl,
            false,
            restNotifyUrl,
            'http-post'
        );

        // The feed changes to version 2.
        mock.route('GET', feedPath, 200, changedFeed);

        // A single, ordinary rssCloud ping for the topic.
        const pingRes = await chai
            .request(SERVER_URL)
            .post('/ping')
            .set('content-type', 'application/x-www-form-urlencoded')
            .send({ url: topicUrl });
        expect(pingRes).status(200);

        // The rssCloud subscriber received its form-encoded notify.
        expect(mock.requests.POST)
            .property(restNotifyPath)
            .lengthOf(1, `Missing rssCloud notify POST ${restNotifyPath}`);
        expect(mock.requests.POST[restNotifyPath][0].body).property(
            'url',
            topicUrl
        );

        // The WebSub subscriber received the changed feed body as content
        // distribution, with the origin's Content-Type relayed and the hub/self
        // Link rels advertised.
        expect(mock.requests.POST)
            .property(websubCallbackPath)
            .lengthOf(1, `Missing WebSub content POST ${websubCallbackPath}`);
        const delivery = mock.requests.POST[websubCallbackPath][0];
        expect(delivery.body).to.equal(changedFeed);
        expect(delivery.headers['content-type']).to.match(/text\/html/);
        const link = delivery.headers['link'];
        expect(link, 'Link header').to.be.a('string');
        expect(link).to.include('rel="hub"');
        expect(link).to.include(`<${topicUrl}>; rel="self"`);
    });
});

describe('WebSub authenticated distribution', function() {
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

    // Subscribe via WebSub (optionally with a secret), wait for the async
    // handshake, change the feed, then fire one rssCloud ping. Returns the
    // captured content-distribution POST so a test can verify its signature.
    async function deliverViaPing({ secret }) {
        const feedPath = '/auth-feed.xml',
            topicUrl = mock.serverUrl + feedPath,
            callbackPath = '/auth-websub-callback',
            callbackUrl = mock.serverUrl + callbackPath,
            changedFeed = '<rss>authenticated-payload</rss>';

        mock.route('GET', feedPath, 200, '<rss>version-1</rss>');
        mock.route('GET', callbackPath, 200, req => {
            return req.query['hub.challenge'];
        });
        mock.route('POST', callbackPath, 200, 'ok');

        const subRes = await hubRequest({
            'hub.mode': 'subscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl,
            ...(secret ? { 'hub.secret': secret } : {})
        });
        expect(subRes).status(202);

        const websubSub = await waitForWebSubSubscription(topicUrl);
        expect(websubSub, 'websub subscription should be recorded').to.not.be
            .null;

        mock.route('GET', feedPath, 200, changedFeed);

        const pingRes = await chai
            .request(SERVER_URL)
            .post('/ping')
            .set('content-type', 'application/x-www-form-urlencoded')
            .send({ url: topicUrl });
        expect(pingRes).status(200);

        expect(mock.requests.POST)
            .property(callbackPath)
            .lengthOf(1, `Missing WebSub content POST ${callbackPath}`);
        return { delivery: mock.requests.POST[callbackPath][0], changedFeed };
    }

    it('signs the delivered body with X-Hub-Signature when the subscriber supplied a secret', async function() {
        const secret = 'shared-websub-secret';
        const { delivery, changedFeed } = await deliverViaPing({ secret });

        // The subscriber recomputes the HMAC over the body it received.
        expect(delivery.body).to.equal(changedFeed);
        const expected =
            'sha256=' +
            crypto
                .createHmac('sha256', secret)
                .update(delivery.body)
                .digest('hex');
        expect(delivery.headers['x-hub-signature']).to.equal(expected);
    });

    it('sends no X-Hub-Signature when the subscriber supplied no secret', async function() {
        const { delivery } = await deliverViaPing({ secret: null });

        expect(delivery.headers).to.not.have.property('x-hub-signature');
    });
});

describe('WebSub unsubscribe', function() {
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

    // Establish a recorded websub subscription, then return its topic/callback so
    // a test can drive the unsubscribe handshake. `echoOnUnsubscribe` toggles
    // whether the callback confirms the unsubscribe intent.
    async function subscribed({ echoOnUnsubscribe }) {
        const feedPath = '/unsub-feed.xml',
            topicUrl = mock.serverUrl + feedPath,
            callbackPath = '/unsub-callback',
            callbackUrl = mock.serverUrl + callbackPath;

        mock.route('GET', feedPath, 200, '<RSS Feed />');
        // Always echo the subscribe challenge; echo the unsubscribe challenge
        // only when the scenario wants the intent confirmed.
        mock.route('GET', callbackPath, 200, req => {
            if (req.query['hub.mode'] === 'unsubscribe' && !echoOnUnsubscribe) {
                return 'refused';
            }
            return req.query['hub.challenge'];
        });

        const subRes = await hubRequest({
            'hub.mode': 'subscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl
        });
        expect(subRes).status(202);

        const sub = await waitForWebSubSubscription(topicUrl);
        expect(sub, 'websub subscription should be recorded').to.not.be.null;

        return { topicUrl, callbackUrl, callbackPath };
    }

    it('accepts an unsubscribe, verifies intent, and removes the subscription', async function() {
        const { topicUrl, callbackUrl, callbackPath } = await subscribed({
            echoOnUnsubscribe: true
        });

        const res = await hubRequest({
            'hub.mode': 'unsubscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl
        });
        expect(res).status(202);

        const removed = await waitForWebSubUnsubscription(topicUrl);
        expect(removed, 'subscription should be removed after verified unsubscribe')
            .to.be.true;

        // The hub performed an unsubscribe-mode verification GET on the callback.
        const unsubscribeVerifications = mock.requests.GET[callbackPath].filter(
            req => req.query['hub.mode'] === 'unsubscribe'
        );
        expect(unsubscribeVerifications).to.have.lengthOf(1);
    });

    it('does not remove the subscription when the callback refuses to echo', async function() {
        const { topicUrl, callbackUrl } = await subscribed({
            echoOnUnsubscribe: false
        });

        const res = await hubRequest({
            'hub.mode': 'unsubscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl
        });
        // Still 202 — validation is synchronous, verification is not.
        expect(res).status(202);

        const removed = await waitForWebSubUnsubscription(topicUrl, {
            timeoutMs: 2000
        });
        expect(removed, 'subscription must survive an unconfirmed unsubscribe').to
            .be.false;
    });
});

describe('WebSub leases', function() {
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

    it('clamps the requested lease to the configured bounds and echoes it in the verification GET', async function() {
        const feedPath = '/lease-feed.xml',
            topicUrl = mock.serverUrl + feedPath,
            callbackPath = '/lease-callback',
            callbackUrl = mock.serverUrl + callbackPath;

        mock.route('GET', feedPath, 200, '<RSS Feed />');
        mock.route('GET', callbackPath, 200, req => req.query['hub.challenge']);

        // 5 seconds is below the 300s minimum and is clamped up to it.
        const res = await hubRequest({
            'hub.mode': 'subscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl,
            'hub.lease_seconds': '5'
        });
        expect(res).status(202);

        const sub = await waitForWebSubSubscription(topicUrl);
        expect(sub, 'websub subscription should be recorded').to.not.be.null;
        expect(sub.details).to.have.property('leaseSeconds', 300);

        // The verification GET echoed the chosen (clamped) lease.
        const verification = mock.requests.GET[callbackPath][0];
        expect(verification.query['hub.lease_seconds']).to.equal('300');
    });

    it('drops a lapsed lease on removeExpired', async function() {
        const feedPath = '/lease-expire-feed.xml',
            topicUrl = mock.serverUrl + feedPath,
            callbackPath = '/lease-expire-callback',
            callbackUrl = mock.serverUrl + callbackPath;

        mock.route('GET', feedPath, 200, '<RSS Feed />');
        mock.route('GET', callbackPath, 200, req => req.query['hub.challenge']);

        const res = await hubRequest({
            'hub.mode': 'subscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl
        });
        expect(res).status(202);

        const sub = await waitForWebSubSubscription(topicUrl);
        expect(sub, 'websub subscription should be recorded').to.not.be.null;

        // Force the lease to have lapsed, then run expiry housekeeping.
        const dayjs = await getDayjs();
        sub.whenExpires = dayjs()
            .utc()
            .subtract(1, 'hour')
            .format();
        await storeApi.updateSubscription(topicUrl, sub);

        await storeApi.removeExpired();

        const remaining = (await storeApi.findSubscription(topicUrl)) || [];
        const stillThere = remaining.find(s => s.protocol === 'websub');
        expect(stillThere, 'lapsed lease should be removed').to.be.undefined;
    });
});

describe('WebSub native publish', function() {
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

    // A pure-WebSub publisher (no rssCloud ping) triggers the same fan-out by
    // POSTing hub.mode=publish; the hub re-fetches the topic and distributes.
    it('distributes content to a WebSub subscriber from a hub.mode=publish', async function() {
        const feedPath = '/publish-feed.xml',
            topicUrl = mock.serverUrl + feedPath,
            callbackPath = '/publish-callback',
            callbackUrl = mock.serverUrl + callbackPath,
            changedFeed = '<rss>published-update</rss>';

        mock.route('GET', feedPath, 200, '<rss>version-1</rss>');
        mock.route('GET', callbackPath, 200, req => req.query['hub.challenge']);
        mock.route('POST', callbackPath, 200, 'ok');

        // Subscribe via WebSub (the pre-ping records version 1's hash).
        const subRes = await hubRequest({
            'hub.mode': 'subscribe',
            'hub.callback': callbackUrl,
            'hub.topic': topicUrl
        });
        expect(subRes).status(202);
        const sub = await waitForWebSubSubscription(topicUrl);
        expect(sub, 'websub subscription should be recorded').to.not.be.null;

        // The feed changes, then a pure-WebSub publisher notifies the hub.
        mock.route('GET', feedPath, 200, changedFeed);
        const pubRes = await hubRequest({
            'hub.mode': 'publish',
            'hub.url': topicUrl
        });
        expect(pubRes).status(202);

        // The re-fetch + fan-out run out of band, so poll for the delivery.
        const delivery = await waitForDeliveryPost(callbackPath);
        expect(delivery, 'WebSub subscriber should receive content').to.not.be
            .null;
        expect(delivery.body).to.equal(changedFeed);
    });
});
