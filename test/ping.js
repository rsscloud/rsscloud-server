const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const chai = require("chai");
const chaiHttp = require("chai-http");
const chaiXml = require("chai-xml");
const expect = chai.expect;
const config = require("../config");
const mongodb = require('../services/mongodb');
const SERVER_URL = process.env.APP_URL || "http://localhost:5337";
const MOCK_SERVER_PORT = process.env.MOCK_SERVER_PORT || 8002;
const MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || `http://localhost:${MOCK_SERVER_PORT}`;

chai.use(chaiHttp);
chai.use(chaiXml);

const mock = {
	app: express(),
	server: null,
	requests: [],
	status: 404,
	responseBody: ''
};

const setupMock = (status, body) => {
	mock.status = status;
	mock.responseBody = body;
};

const initMongo = () => {
	return mongodb.connect('rsscloud', config.mongodbUri);
};

const teardownMongo = () => {
	return mongodb.close('rsscloud');
};

const initMock = async () => {
	mock.app.use(bodyParser.urlencoded({ extended: false }));
	mock.app.use(bodyParser.json());
	mock.app.get("*", (req, res) => {
		mock.requests.push(req);
		res.status(mock.status).send(mock.responseBody);
	});
	 mock.app.post("*", (req, res) => {
		mock.requests.push(req);
		res.status(mock.status).send(mock.responseBody);
	});

	mock.server = await mock.app.listen(MOCK_SERVER_PORT);
	console.log(`Mock server started on port: ${MOCK_SERVER_PORT}`);
};

const teardownMock = () => {
	if (mock.server) {
		mock.server.close();
		delete mock.server;
	}
};

describe("REST Ping", () => {
	before(async () => {
		await initMongo();
		await initMock();
	});

	after(async () => {
		await teardownMongo();
		teardownMock();
	});

	beforeEach(async () => {
		await mongodb.get('rsscloud').createCollection('events');
		await mongodb.get('rsscloud').createCollection('resources');
		await mongodb.get('rsscloud').createCollection('subscriptions');

		mock.requests = [];
	});

	afterEach(async () => {
		await mongodb.get('rsscloud').collection('events').drop();
		await mongodb.get('rsscloud').collection('resources').drop();
		await mongodb.get('rsscloud').collection('subscriptions').drop();
	});

	it('should accept a ping for new resource and return xml', done => {
		setupMock(200, '<RSS Feed />');

	    chai
			.request(SERVER_URL)
			.post("/ping")
			.set('content-type', 'application/x-www-form-urlencoded')
			.send({ url: MOCK_SERVER_URL + '/rss.xml' })
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
				done();
			});
	});

	it('should accept a ping for new resource and return json', done => {
		setupMock(200, '<RSS Feed />');

	    chai
			.request(SERVER_URL)
			.post("/ping")
			.set('accept', 'application/json')
			.set('content-type', 'application/x-www-form-urlencoded')
			.send({ url: MOCK_SERVER_URL + '/rss.xml' })
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
				done();
			});
	});

	it('should reject a ping for bad resource and return xml', done => {
	    chai
			.request(SERVER_URL)
			.post("/ping")
			.set('content-type', 'application/x-www-form-urlencoded')
			.send({ url: 'http://dsajkdljsaldksa/rss.xml' })
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				expect(res.text).xml.equal('<result success="false" msg="Error: getaddrinfo ENOTFOUND dsajkdljsaldksa"/>');
				done();
			});
	});

	it('should reject a ping for bad resource and return json', done => {
	    chai
			.request(SERVER_URL)
			.post("/ping")
			.set('accept', 'application/json')
			.set('content-type', 'application/x-www-form-urlencoded')
			.send({ url: 'http://dsajkdljsaldksa/rss.xml' })
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				expect(res.body).deep.equal({ success: false, msg: 'Error: getaddrinfo ENOTFOUND dsajkdljsaldksa' });
				done();
			});
	});
});
