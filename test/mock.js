const https = require('https');
const fs = require('fs');
const express = require("express");
const bodyParser = require("body-parser"),
    textParser = bodyParser.text({ type: '*/xml'}),
    urlencodedParser = bodyParser.urlencoded({ extended: false });
const parseRpcRequest = require('../services/parse-rpc-request'),
    MOCK_SERVER_PORT = process.env.MOCK_SERVER_PORT || 8002,
    MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || `http://localhost:${MOCK_SERVER_PORT}`,
    SECURE_MOCK_SERVER_PORT = process.env.SECURE_MOCK_SERVER_PORT || 8003,
    SECURE_MOCK_SERVER_URL = process.env.SECURE_MOCK_SERVER_URL || `http://localhost:${SECURE_MOCK_SERVER_PORT}`;
const rpcReturnFault = require('../services/rpc-return-fault');

function restController(req, res) {
    const method = req.method,
        path = req.path;

    if (this.routes[method][path]) {
        this.requests[method][path].push(req);
        res
            .status(this.routes[method][path].status)
            .send(this.routes[method][path].responseBody);
    } else {
        res
            .status(501)
            .send(`Unknown route ${method} ${path}`);
    }
}

function rpcController(req, res) {
    parseRpcRequest(req)
        .then(request => {
            req.rpcBody = request;
            if (this.routes.RPC2[request.methodName]) {
                this.requests.RPC2[request.methodName].push(req);
                res
                    .status(200)
                    .send(this.routes.RPC2[request.methodName].responseBody);
            } else {
                res
                    .status(501)
                    .send(rpcReturnFault(1, `Unknown methodName ${request.methodName}`));
            }
        })
        .catch(err => {
            res
                .status(500)
                .send(rpcReturnFault(1, err.message));
        });
}

module.exports = {
    app: express(),
    server: null,
    serverUrl: MOCK_SERVER_URL,
    secureServer: null,
    secureServerUrl: SECURE_MOCK_SERVER_URL,
    requests: {
        'GET': {},
        'POST': {},
        'RPC2': {}
    },
    routes: {
        'GET': {},
        'POST': {},
        'RPC2': {}
    },
    route: function (method, path, status, responseBody) {
        this.requests[method][path] = [];
        this.routes[method][path] = {
            status,
            responseBody
        };
    },
    rpc: function (methodName, responseBody) {
        const method = 'RPC2';
        this.requests[method][methodName] = [];
        this.routes[method][methodName] = {
            responseBody
        };
    },
    before: async function () {
        this.app.post("/RPC2", textParser, rpcController.bind(this));
        this.app.get("*", restController.bind(this));
        this.app.post("*", urlencodedParser, restController.bind(this));

        this.server = await this.app.listen(MOCK_SERVER_PORT);
        console.log(`    → Mock server started on port: ${MOCK_SERVER_PORT}`);

        this.secureServer = await https.createServer({
            key: fs.readFileSync('test/keys/server.key'),
            cert: fs.readFileSync('test/keys/server.cert')
        }, this.app).listen(SECURE_MOCK_SERVER_PORT);
        console.log(`    → Mock secure server started on port: ${SECURE_MOCK_SERVER_PORT}`);
    },
    after: async function () {
        if (this.server) {
            this.server.close();
            delete this.server;

            this.secureServer.close();
            delete this.secureServer;

            this.routes = {
                'GET': {},
                'POST': {},
                'RPC2': {}
            };
        }
    },
    beforeEach: async function () {
        // Nothing
    },
    afterEach: async function () {
        this.requests = {
            'GET': {},
            'POST': {},
            'RPC2': {}
        };
    }
};
