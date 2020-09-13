const chai = require("chai"),
    chaiHttp = require("chai-http"),
    chaiXml = require("chai-xml"),
    expect = chai.expect,
    SERVER_URL = process.env.APP_URL || "http://localhost:5337",
    mock = require("./mock"),
    mongodb = require("./mongodb"),
    xmlrpc = require("davexmlrpc");

chai.use(chaiHttp);
chai.use(chaiXml);

for (const protocol of ['http-post', 'https-post']) {

    describe(`Ping REST to REST ${protocol}`, () => {
        before(async () => {
            await mongodb.before();
            await mock.before();
        });

        after(async () => {
            await mongodb.after();
            await mock.after();
        });

        beforeEach(async () => {
            await mongodb.beforeEach();
            await mock.beforeEach();
        });

        afterEach(async () => {
            await mongodb.afterEach();
            await mock.afterEach();
        });

        it('should accept a ping for new resource and return XML', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath;

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res = await chai
                .request(SERVER_URL)
                .post("/ping")
                .set('content-type', 'application/x-www-form-urlencoded')
                .send({ url: resourceUrl });

            expect(res).status(200);
            expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
            expect(mock.requests.POST[pingPath][0]).property('body');
            expect(mock.requests.POST[pingPath][0].body).property('url');
            expect(mock.requests.POST[pingPath][0].body.url).equal(resourceUrl);
        });

        it('should accept a ping for new resource and return JSON', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + '/feedupdated';

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res = await chai
                .request(SERVER_URL)
                .post("/ping")
                .set('accept', 'application/json')
                .set('content-type', 'application/x-www-form-urlencoded')
                .send({ url: resourceUrl });

            expect(res).status(200);
            expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
            expect(mock.requests.POST[pingPath][0]).property('body');
            expect(mock.requests.POST[pingPath][0].body).property('url');
            expect(mock.requests.POST[pingPath][0].body.url).equal(resourceUrl);
        });

        it('should reject a ping for bad resource and return XML', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath;

            mock.route('GET', feedPath, 404, 'Not Found');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res = await chai
                .request(SERVER_URL)
                .post("/ping")
                .set('content-type', 'application/x-www-form-urlencoded')
                .send({ url: resourceUrl });

            expect(res).status(200);
            expect(res.text).xml.equal(`<result success="false" msg="The ping was cancelled because there was an error reading the resource at URL ${resourceUrl}."/>`);
            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
        });

        it('should reject a ping for bad resource and return JSON', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath;

            mock.route('GET', feedPath, 404, 'Not Found');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res = await chai
                .request(SERVER_URL)
                .post("/ping")
                .set('accept', 'application/json')
                .set('content-type', 'application/x-www-form-urlencoded')
                .send({ url: resourceUrl });

            expect(res).status(200);
            expect(res.body).deep.equal({ success: false, msg: `The ping was cancelled because there was an error reading the resource at URL ${resourceUrl}.` });
            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
        });

        it('should accept a ping for unchanged resource and return XML', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                requester = chai.request(SERVER_URL).keepOpen();

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res;

            res = await requester.post("/ping")
                .set('content-type', 'application/x-www-form-urlencoded')
                .send({ url: resourceUrl });

            expect(res).status(200);
            expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');

            res = await requester.post("/ping")
                .set('content-type', 'application/x-www-form-urlencoded')
                .send({ url: resourceUrl });

            expect(res).status(200);
            expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
            expect(mock.requests.GET).property(feedPath).lengthOf(2, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(1, `Should only POST ${pingPath} once`);

            requester.close();
        });

        it('should accept a ping for unchanged resource and return JSON', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                requester = chai.request(SERVER_URL).keepOpen();

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res;

            res = await requester.post("/ping")
                .set('accept', 'application/json')
                .set('content-type', 'application/x-www-form-urlencoded')
                .send({ url: resourceUrl });

            expect(res).status(200);
            expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });

            res = await requester.post("/ping")
                .set('accept', 'application/json')
                .set('content-type', 'application/x-www-form-urlencoded')
                .send({ url: resourceUrl });

            expect(res).status(200);
            expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
            expect(mock.requests.GET).property(feedPath).lengthOf(2, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(1, `Should only POST ${pingPath} once`);

            requester.close();
        });
    });

} // end for protocol
