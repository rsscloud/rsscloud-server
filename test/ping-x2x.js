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

describe("Ping XML-RPC to XML-RPC", () => {
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
            resourceUrl = mock.serverUrl + feedPath,
            notifyProcedure = 'river.feedUpdated',
            apiurl = mock.serverUrl + '/RPC2',
            protocol = 'xml-rpc',
            verb = 'rssCloud.ping',
            params = [resourceUrl],
            rpctext = xmlrpc.buildCall(verb, params, 'xml');

        mock.route('GET', feedPath, 200, '<RSS Feed />');
        mock.rpc(notifyProcedure, rpcReturnSuccess(true));
        mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

        let res = await chai
            .request(SERVER_URL)
            .post("/RPC2")
            .set('content-type', 'text/xml')
            .send(rpctext);

        expect(res).status(200);
        expect(res.text).xml.equal(rpcReturnSuccess(true));
        expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
        expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(1, `Missing XML-RPC call ${notifyProcedure}`);
        expect(mock.requests.RPC2[notifyProcedure][0]).property('rpcBody');
        expect(mock.requests.RPC2[notifyProcedure][0].rpcBody.params[0]).equal(resourceUrl);
    });

    it('should reject a ping for bad resource and return XML', async () => {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            notifyProcedure = 'river.feedUpdated',
            apiurl = mock.serverUrl + '/RPC2',
            protocol = 'xml-rpc',
            verb = 'rssCloud.ping',
            params = [resourceUrl],
            rpctext = xmlrpc.buildCall(verb, params, 'xml');

        mock.route('GET', feedPath, 404, 'Not Found');
        mock.rpc(notifyProcedure, rpcReturnSuccess(true));
        mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

        let res = await chai
            .request(SERVER_URL)
            .post("/RPC2")
            .set('content-type', 'text/xml')
            .send(rpctext);

        expect(res).status(200);
        expect(res.text).xml.equal(rpcReturnSuccess(true));
        expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
        expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(0, `Should not XML-RPC call ${notifyProcedure}`);
    });

    it('should accept a ping for unchanged resource and return XML', async () => {
        const feedPath = '/rss.xml',
            resourceUrl = mock.serverUrl + feedPath,
            notifyProcedure = 'river.feedUpdated',
            apiurl = mock.serverUrl + '/RPC2',
            protocol = 'xml-rpc',
            requester = chai.request(SERVER_URL).keepOpen(),
            verb = 'rssCloud.ping',
            params = [resourceUrl],
            rpctext = xmlrpc.buildCall(verb, params, 'xml');

        mock.route('GET', feedPath, 200, '<RSS Feed />');
        mock.rpc(notifyProcedure, rpcReturnSuccess(true));
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
        expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(1, `Should only XML-RPC call ${notifyProcedure} once`);

        requester.close();
    });
});
