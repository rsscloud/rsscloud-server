const express = require("express");
const bodyParser = require("body-parser");
const urlencodedParser = bodyParser.urlencoded({ extended: false });
const MOCK_SERVER_PORT = process.env.MOCK_SERVER_PORT || 8002;
const MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || `http://localhost:${MOCK_SERVER_PORT}`;

function controller(req, res) {
	const method = req.method;
	const path = req.path;

	if (this.routes[method][path]) {
		this.requests[method][path].push(req);
		res
		.status(this.routes[method][path].status)
		.send(this.routes[method][path].responseBody);
	} else {
		throw new Error(`Unknown mock route ${method} ${path}`);
	}
}

module.exports = {
	app: express(),
	server: null,
	serverUrl: MOCK_SERVER_URL,
	requests: {
		'GET': {},
		'POST': {}
	},
	routes: {
		'GET': {},
		'POST': {}
	},
	route: function (method, path, status, responseBody) {
		this.requests[method][path] = [];
		this.routes[method][path] = {
			status,
			responseBody
		};
	},
	before: async function () {
		this.app.get("*", controller.bind(this));
		this.app.post("*", urlencodedParser, controller.bind(this));

		this.server = await this.app.listen(MOCK_SERVER_PORT);
		console.log(`    → Mock server started on port: ${MOCK_SERVER_PORT}`);
	},
	after: async function () {
		if (this.server) {
			this.server.close();
			delete this.server;

			this.routes = {
				'GET': {},
				'POST': {}
			};
		}
	},
	beforeEach: async function () {
		// Nothing
	},
	afterEach: async function () {
		this.requests = {
			'GET': {},
			'POST': {}
		};
	}
}
