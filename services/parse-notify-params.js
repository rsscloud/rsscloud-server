(function () {
    "use strict";

    var appMessages = require('./app-messages'),
        sprintf = require('sprintf-js').sprintf;

    function parseUrlList(argv) {
        var key, urlList = [];

        for (key in argv) {
            if (argv.hasOwnProperty(key) && 0 === key.toLowerCase().indexOf('url')) {
                urlList.push(argv[key]);
            }
        }

        return urlList;
    }

    function glueUrlParts(scheme, client, port, path, protocol, callback) {
        var apiurl;

        switch (protocol) {
        case 'http-post':
            apiurl = scheme + '://';
            break;
        default:
            return callback(sprintf(appMessages.error.subscription.invalidProtocol, protocol));
        }

        if (client.indexOf(':') > -1) {
            client = '[' + client + ']';
        }

        apiurl += client + ':' + port;

        if (0 !== path.indexOf('/')) {
            path = '/' + path;
        }

        apiurl += path;

        return callback(null, apiurl);
    }

    function parseNotifyParams(req, callback) {
        var s = '',
            params = {},
            parts = {};

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
        if (0 === s.length) {
            parts.scheme = 'http';
            parts.port = req.body.port;
            parts.path = req.body.path;
            parts.protocol = req.body.protocol;
            glueUrlParts(
                parts.scheme,
                parts.client,
                parts.port,
                parts.path,
                parts.protocol,
                function (err, apiurl) {
                    if (err) {
                        return callback(err);
                    }
                    params.apiurl = apiurl;
                    return callback(null, params);
                }
            );
        } else {
            s = s.substr(0, s.length - 2);
            return callback(sprintf(appMessages.error.subscription.missingParams, s));
        }
    }

    module.exports = parseNotifyParams;
}());
