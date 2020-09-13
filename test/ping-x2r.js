const chai = require("chai"),
    chaiHttp = require("chai-http"),
    chaiXml = require("chai-xml"),
    expect = chai.expect,
    SERVER_URL = process.env.APP_URL || "http://localhost:5337",
    mock = require("./mock"),
    mongodb = require("./mongodb"),
    xmlrpc = require("davexmlrpc"),
    rpcReturnSuccess = require('../services/rpc-return-success');

chai.use(chaiHttp);
chai.use(chaiXml);

for (const protocol of ['http-post', 'https-post']) {

    describe(`Ping XML-RPC to REST ${protocol}`, () => {
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

        it('should accept a ping for new resource and return XML', () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                verb = 'rssCloud.ping',
                params = [resourceUrl],
                rpctext = xmlrpc.buildCall(verb, params, 'xml');

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            return chai
                .request(SERVER_URL)
                .post("/RPC2")
                .set('content-type', 'text/xml')
                .send(rpctext)
                .then(res => {
                    expect(res).status(200);
                    expect(res.text).xml.equal(rpcReturnSuccess(true));
                    expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
                    expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
                    expect(mock.requests.POST[pingPath][0]).property('body');
                    expect(mock.requests.POST[pingPath][0].body).property('url');
                    expect(mock.requests.POST[pingPath][0].body.url).equal(resourceUrl);
                });
        });

        it('should reject a ping for bad resource and return XML', () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                verb = 'rssCloud.ping',
                params = [resourceUrl],
                rpctext = xmlrpc.buildCall(verb, params, 'xml');

            mock.route('GET', feedPath, 404, 'Not Found');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            return chai
                .request(SERVER_URL)
                .post("/RPC2")
                .set('content-type', 'text/xml')
                .send(rpctext)
                .then(res => {
                    expect(res).status(200);
                    expect(res.text).xml.equal(rpcReturnSuccess(true));
                    expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
                    expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
                });
        });

        it('should accept a ping for unchanged resource and return XML', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath,
                notifyProcedure = false,
                apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                requester = chai.request(SERVER_URL).keepOpen(),
                verb = 'rssCloud.ping',
                params = [resourceUrl],
                rpctext = xmlrpc.buildCall(verb, params, 'xml');

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res;

            res = await requester.post("/RPC2")
                .set('content-type', 'text/xml')
                .send(rpctext);

            expect(res).status(200);
            expect(res.text).xml.equal(rpcReturnSuccess(true));

            res = await requester.post("/RPC2")
                .set('content-type', 'text/xml')
                .send(rpctext);

            expect(res).status(200);
            expect(res.text).xml.equal(rpcReturnSuccess(true));
            expect(mock.requests.GET).property(feedPath).lengthOf(2, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(1, `Should only POST ${pingPath} once`);

            requester.close();
        });
    });

} // end for protocol
