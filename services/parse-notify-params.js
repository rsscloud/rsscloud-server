(function () {
    "use strict";

    const appMessages = require('./app-messages'),
        sprintf = require('sprintf-js').sprintf;

    function validProtocol(protocol) {
        switch (protocol) {
        case 'http-post':
        case 'https-post':
        case 'xml-rpc':
            return true;
        default:
            throw new Error(sprintf(appMessages.error.subscription.invalidProtocol, protocol));
        }
    }

    function parseUrlList(argv) {
        let key, urlList = [];

        if (undefined === argv.hasOwnProperty) {
            Object.setPrototypeOf(argv, {});
        }

        for (key in argv) {
            if (argv.hasOwnProperty(key) && 0 === key.toLowerCase().indexOf('url')) {
                urlList.push(argv[key]);
            }
        }

        return urlList;
    }

    function glueUrlParts(scheme, client, port, path) {
        let apiurl = scheme + '://';

        if (client.indexOf(':') > -1) {
            client = '[' + client + ']';
        }

        apiurl += client + ':' + port;

        if (0 !== path.indexOf('/')) {
            path = '/' + path;
        }

        apiurl += path;

        return apiurl;
    }

    function rest(req) {
        let s = '',
            params = {},
            parts = {};

        if (validProtocol(req.body.protocol)) {
            params.protocol = req.body.protocol;
        }

        params.urlList = parseUrlList(req.body);

        if (undefined === req.body.domain) {
            parts.client = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            params.diffDomain = false;
        } else {
            parts.client = req.body.domain;
            params.diffDomain = true;
        }
        if (undefined === req.body.port) {
            s += 'port, ';
        }
        if (undefined === req.body.path) {
            s += 'path, ';
        }
        if (undefined === req.body.protocol) {
            s += 'protocol, ';
        }

        if (req.body.notifyProcedure && 'xml-rpc' === req.body.protocol) {
            params.notifyProcedure = req.body.notifyProcedure;
        } else {
            params.notifyProcedure = false;
        }

        if (0 === s.length) {
            parts.scheme = 'https-post' === params.protocol ? 'https' : 'http';
            parts.port = req.body.port;
            parts.path = req.body.path;

            params.apiurl = glueUrlParts(
                parts.scheme,
                parts.client,
                parts.port,
                parts.path
            );

            return params;
        } else {
            s = s.substr(0, s.length - 2);
            throw new Error(sprintf(appMessages.error.subscription.missingParams, s));
        }
    }

    function rpc(req, rpcParams) {
        let params = {},
            parts = {};

        if (5 > rpcParams.length) {
            throw new Error(sprintf(appMessages.error.rpc.notEnoughParams, 'pleaseNotify'));
        } else if (6 < rpcParams.length) {
            throw new Error(sprintf(appMessages.error.rpc.tooManyParams, 'pleaseNotify'));
        }

        if (validProtocol(rpcParams[3])) {
            params.protocol = rpcParams[3];
        }

        params.urlList = rpcParams[4];

        if (undefined === rpcParams[5]) {
            parts.client = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            params.diffDomain = false;
        } else {
            parts.client = rpcParams[5];
            params.diffDomain = true;
        }

        if (rpcParams[0] && 'xml-rpc' === params.protocol) {
            params.notifyProcedure = rpcParams[0];
        } else {
            params.notifyProcedure = false;
        }

        parts.scheme = 'https-post' === params.protocol ? 'https' : 'http';
        parts.port = rpcParams[1];
        parts.path = rpcParams[2];

        params.apiurl = glueUrlParts(
            parts.scheme,
            parts.client,
            parts.port,
            parts.path
        );

        return params;
    }

    module.exports = { rest, rpc };
}());
