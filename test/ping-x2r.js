const chai = require("chai");
const chaiHttp = require("chai-http");
const chaiXml = require("chai-xml");
const expect = chai.expect;
const SERVER_URL = process.env.APP_URL || "http://localhost:5337";
const mock = require("./mock");
const mongodb = require("./mongodb");
const xmlrpc = require("davexmlrpc");

chai.use(chaiHttp);
chai.use(chaiXml);

describe("Ping XML-RPC to REST", () => {
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

	it('should accept a ping for new resource and return XML', done => {
		const feedPath = '/rss.xml',
			pingPath = '/feedupdated',
			resourceUrl = mock.serverUrl + feedPath,
			notifyProcedure = false,
			apiurl = mock.serverUrl + pingPath,
			protocol = 'http-post';

		mock.route('GET', feedPath, 200, '<RSS Feed />');
		mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
		mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

		const verb = 'rssCloud.ping',
			params = [resourceUrl],
			rpctext = xmlrpc.buildCall(verb, params, 'xml');

	    chai
			.request(SERVER_URL)
			.post("/RPC2")
			.set('content-type', 'text/xml')
			.send(rpctext)
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				expect(res.text).xml.equal('<methodResponse><params><param><value><boolean>1</boolean></value></param></params></methodResponse>');
				expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
				expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
				expect(mock.requests.POST[pingPath][0]).property('body');
				expect(mock.requests.POST[pingPath][0].body).property('url');
				expect(mock.requests.POST[pingPath][0].body.url).equal(resourceUrl);
				done();
			});
	});

	it('should reject a ping for bad resource and return XML', done => {
		const feedPath = '/rss.xml',
			pingPath = '/feedupdated',
			resourceUrl = mock.serverUrl + feedPath,
			notifyProcedure = false,
			apiurl = mock.serverUrl + pingPath,
			protocol = 'http-post';

		mock.route('GET', feedPath, 404, 'Not Found');
		mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
		mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

		const verb = 'rssCloud.ping',
			params = [resourceUrl],
			rpctext = xmlrpc.buildCall(verb, params, 'xml');

	    chai
			.request(SERVER_URL)
			.post("/RPC2")
			.set('content-type', 'text/xml')
			.send(rpctext)
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				// Dave's rssCloud server always returns true whether it succeeded or not

				expect(res).status(200);
				expect(res.text).xml.equal('<methodResponse><params><param><value><boolean>1</boolean></value></param></params></methodResponse>');
				expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
				expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
				done();
			});
	});

	it('should accept a ping for unchanged resource and return XML', done => {
		const feedPath = '/rss.xml',
			pingPath = '/feedupdated',
			resourceUrl = mock.serverUrl + feedPath,
			notifyProcedure = false,
			apiurl = mock.serverUrl + pingPath,
			protocol = 'http-post';

		mock.route('GET', feedPath, 200, '<RSS Feed />');
		mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
		mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

	    const requester = chai.request(SERVER_URL).keepOpen();

		const verb = 'rssCloud.ping',
			params = [resourceUrl],
			rpctext = xmlrpc.buildCall(verb, params, 'xml');

		let res;

	    requester.post("/RPC2")
			.set('content-type', 'text/xml')
			.send(rpctext)
			.then((res) => {
				expect(res).status(200);
				expect(res.text).xml.equal('<methodResponse><params><param><value><boolean>1</boolean></value></param></params></methodResponse>');

			    return requester.post("/RPC2")
					.set('content-type', 'text/xml')
					.send(rpctext);
			})
			.then((res) => {
				expect(res).status(200);
				expect(res.text).xml.equal('<methodResponse><params><param><value><boolean>1</boolean></value></param></params></methodResponse>');
				expect(mock.requests.GET).property(feedPath).lengthOf(2, `Missing GET ${feedPath}`);
				expect(mock.requests.POST).property(pingPath).lengthOf(1, `Should only POST ${pingPath} once`);

				requester.close()
				done();
			})
			.catch((err) => {
				requester.close()
				done(err);
			});
	});
});
