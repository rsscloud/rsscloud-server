const config = require('../config'),
    ErrorResponse = require('./error-response'),
    notifyOne = require('./notify-one'),
    getRandomPassword = require('./get-random-password'),
    querystring = require('querystring');

async function notifyOneChallengeRest(apiurl, resourceUrl) {
    const challenge = getRandomPassword(20);
    const testUrl = apiurl + '?' + querystring.stringify({
        'url': resourceUrl,
        'challenge': challenge
    });

    console.log(`GET ${testUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout);

    try {
        const res = await fetch(testUrl, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const body = await res.text();

        if (res.status < 200 || res.status > 299 || body !== challenge) {
            throw new ErrorResponse('Notification Failed');
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new ErrorResponse('Notification Failed - Timeout');
        }
        throw err;
    }
}

function notifyOneChallenge(notifyProcedure, apiurl, protocol, resourceUrl) {
    if ('xml-rpc' === protocol) {
        // rssCloud.root originally didn't support this flow
        return notifyOne(notifyProcedure, apiurl, protocol, resourceUrl);
    }

    return notifyOneChallengeRest(apiurl, resourceUrl);
}

module.exports = notifyOneChallenge;
