const https = require('https'),
    fs = require('fs'),
    express = require('express'),
    bodyParser = require('body-parser'),
    textParser = bodyParser.text({ type: '*/xml'}),
    urlencodedParser = bodyParser.urlencoded({ extended: false }),
    parseRpcRequest = require('../services/parse-rpc-request'),
    MOCK_SERVER_DOMAIN = process.env.MOCK_SERVER_DOMAIN,
    MOCK_SERVER_PORT = process.env.MOCK_SERVER_PORT || 8002,
    MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || `http://${MOCK_SERVER_DOMAIN}:${MOCK_SERVER_PORT}`,
    SECURE_MOCK_SERVER_PORT = process.env.SECURE_MOCK_SERVER_PORT || 8003,
    SECURE_MOCK_SERVER_URL = process.env.SECURE_MOCK_SERVER_URL || `https://${MOCK_SERVER_DOMAIN}:${SECURE_MOCK_SERVER_PORT}`,
    rpcReturnFault = require('../services/rpc-return-fault');

async function restController(req, res) {
    const method = req.method,
        path = req.path;

    if (this.routes[method] && this.routes[method][path]) {
        this.requests[method][path].push(req);
        let responseBody = this.routes[method][path].responseBody;
        res
            .status(this.routes[method][path].status)
            .send(typeof responseBody === 'function' ? await responseBody(req) : responseBody);
    } else {
        res
            .status(501)
            .send(`Unknown route ${method} ${path}`);
    }
}

async function rpcController(req, res) {
    try {
        req.rpcBody = await parseRpcRequest(req);
        const method = req.rpcBody.methodName;

        if (this.routes.RPC2[method]) {
            this.requests.RPC2[method].push(req);
            let responseBody = this.routes.RPC2[method].responseBody;
            res
                .status(200)
                .send(typeof responseBody === 'function' ? await responseBody(req) : responseBody);
        } else {
            res
                .status(501)
                .send(rpcReturnFault(1, `Unknown methodName ${method}`));
        }
    } catch(err) {
        res
            .status(500)
            .send(rpcReturnFault(1, err.message));
    }
}

module.exports = {
    app: express(),
    server: null,
    serverDomain: MOCK_SERVER_DOMAIN,
    serverPort: MOCK_SERVER_PORT,
    serverUrl: MOCK_SERVER_URL,
    secureServer: null,
    secureServerPort: SECURE_MOCK_SERVER_PORT,
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
