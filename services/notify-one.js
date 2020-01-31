(function () {
    "use strict";

    const builder = require('xmlbuilder'),
        request = require('request-promise-native');

    async function notifyOneRest(apiurl, resourceUrl) {
        const res = await request({
            method: 'POST',
            uri: apiurl,
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
        });

        const res = await request({
            method: 'POST',
            uri: apiurl,
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
