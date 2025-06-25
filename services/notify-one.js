const builder = require('xmlbuilder'),
    config = require('../config'),
    ErrorResponse = require('./error-response'),
    { URL } = require('url');

async function notifyOneRest(apiurl, resourceUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout);

    try {
        const formData = new URLSearchParams();
        formData.append('url', resourceUrl);

        const res = await fetch(apiurl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData,
            signal: controller.signal,
            redirect: 'manual'
        });

        clearTimeout(timeoutId);

        // Handle redirects manually
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (location) {
                const redirectUrl = new URL(location, apiurl);
                return notifyOneRest(redirectUrl.toString(), resourceUrl);
            }
        }

        if (res.status < 200 || res.status > 299) {
            throw new ErrorResponse('Notification Failed');
        }

        return true;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new ErrorResponse('Notification Failed - Timeout');
        }
        throw err;
    }
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout);

    try {
        const res = await fetch(apiurl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml'
            },
            body: xmldoc,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.status < 200 || res.status > 299) {
            throw new ErrorResponse('Notification Failed');
        }

        return true;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new ErrorResponse('Notification Failed - Timeout');
        }
        throw err;
    }
}

function notifyOne(notifyProcedure, apiurl, protocol, resourceUrl) {
    if ('xml-rpc' === protocol) {
        return notifyOneRpc(notifyProcedure, apiurl, resourceUrl);
    }

    return notifyOneRest(apiurl, resourceUrl);
}

module.exports = notifyOne;
