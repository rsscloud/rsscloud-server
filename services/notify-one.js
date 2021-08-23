(function () {
    "use strict";

    const builder = require('xmlbuilder'),
        config = require('../config'),
        request = require('request-promise-native');

    async function notifyOneRest(apiurl, resourceUrl) {
        const res = await request({
            method: 'POST',
            uri: apiurl,
            timeout: config.requestTimeout,
            form: {
                'url': resourceUrl
            },
            resolveWithFullResponse: true
        });

        if (res.statusCode < 200 || res.statusCode > 299) {
            throw new Error('Notification Failed');
        }

        return true;
    }

    async function notifyOneRpc(notifyProcedure, apiurl, resourceUrl) {
        const xmldoc = builder.create({
            methodCall: {
                methodName: notifyProcedure,
                params: {
                    param: [
                        { value: resourceUrl }
                    ]
                }
            }
        }).end({ pretty: true });

        let res = await request({
            method: 'POST',
            uri: apiurl,
            timeout: 4000,
            body: xmldoc,
            resolveWithFullResponse: true,
            headers: {
                'content-type': 'text/xml'
            }
        });

        if (res.statusCode < 200 || res.statusCode > 299) {
            throw new Error('Notification Failed');
        }

        return true;
    }

    function notifyOne(notifyProcedure, apiurl, protocol, resourceUrl) {
        if ('xml-rpc' === protocol) {
            return notifyOneRpc(notifyProcedure, apiurl, resourceUrl);
        }

        return notifyOneRest(apiurl, resourceUrl);
    }

    module.exports = notifyOne;
}());
