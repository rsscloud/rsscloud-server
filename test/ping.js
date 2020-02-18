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

describe("Ping", () => {
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

	it('should accept a REST ping for new resource and return xml', () => {
		const feedPath = '/rss.xml',
			pingPath = '/feedupdated',
			resourceUrl = mock.serverUrl + feedPath,
			notifyProcedure = false,
			apiurl = mock.serverUrl + pingPath,
			protocol = 'http-post';

		mock.route('GET', feedPath, 200, '<RSS Feed />');
		mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
		mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

	    return chai
			.request(SERVER_URL)
			.post("/ping")
			.set('content-type', 'application/x-www-form-urlencoded')
			.send({ url: resourceUrl })
			.then(res => {
				expect(res).status(200);
				expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
				expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
				expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
				expect(mock.requests.POST[pingPath][0]).property('body');
				expect(mock.requests.POST[pingPath][0].body).property('url');
				expect(mock.requests.POST[pingPath][0].body.url).equal(resourceUrl);
			});
	});

	it('should accept a REST ping for new resource and return json', () => {
		const feedPath = '/rss.xml',
			pingPath = '/feedupdated',
			resourceUrl = mock.serverUrl + feedPath,
			notifyProcedure = false,
			apiurl = mock.serverUrl + '/feedupdated',
			protocol = 'http-post';

		mock.route('GET', feedPath, 200, '<RSS Feed />');
		mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
		mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

	    return chai
			.request(SERVER_URL)
			.post("/ping")
			.set('accept', 'application/json')
			.set('content-type', 'application/x-www-form-urlencoded')
			.send({ url: resourceUrl })
			.then(res => {
				expect(res).status(200);
				expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
				expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
				expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
				expect(mock.requests.POST[pingPath][0]).property('body');
				expect(mock.requests.POST[pingPath][0].body).property('url');
				expect(mock.requests.POST[pingPath][0].body.url).equal(resourceUrl);
			});
	});

	it('should reject a REST ping for bad resource and return xml', () => {
		const feedPath = '/rss.xml',
			pingPath = '/feedupdated',
			resourceUrl = mock.serverUrl + feedPath,
			notifyProcedure = false,
			apiurl = mock.serverUrl + pingPath,
			protocol = 'http-post';

		mock.route('GET', feedPath, 404, 'Not Found');
		mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
		mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

	    return chai
			.request(SERVER_URL)
			.post("/ping")
			.set('content-type', 'application/x-www-form-urlencoded')
			.send({ url: resourceUrl })
			.then(res => {
				expect(res).status(200);
				expect(res.text).xml.equal(`<result success="false" msg="The ping was cancelled because there was an error reading the resource at URL ${resourceUrl}."/>`);
				expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
				expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
			});
	});

	it('should reject a REST ping for bad resource and return json', () => {
		const feedPath = '/rss.xml',
			pingPath = '/feedupdated',
			resourceUrl = mock.serverUrl + feedPath,
			notifyProcedure = false,
			apiurl = mock.serverUrl + pingPath,
			protocol = 'http-post';

		mock.route('GET', feedPath, 404, 'Not Found');
		mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
		mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

	    return chai
			.request(SERVER_URL)
			.post("/ping")
			.set('accept', 'application/json')
			.set('content-type', 'application/x-www-form-urlencoded')
			.send({ url: resourceUrl })
			.then(res => {
				expect(res).status(200);
				expect(res.body).deep.equal({ success: false, msg: `The ping was cancelled because there was an error reading the resource at URL ${resourceUrl}.` });
				expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
				expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
			});
	});

	it('should accept a REST ping for unchanged resource', async () => {
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

		requester.close()

	});

	it('should accept a XML-RPC ping for new resource and return xml', done => {
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
});
