module.exports = {
    error: {
        subscription: {
            missingParams: (params) => `The following parameters were missing from the request body: ${params}.`,
            invalidProtocol: (protocol) => `Can't accept the subscription because the protocol, <i>${protocol}</i>, is unsupported.`,
            readResource: (url) => `The subscription was cancelled because there was an error reading the resource at URL ${url}.`,
            noResources: 'No resources specified.',
            failedHandler: 'The subscription was cancelled because the call failed when we tested the handler.'
        },
        ping: {
            tooRecent: (minSeconds, lastPingSeconds) => `Can't accept the request because the minimum seconds between pings is ${minSeconds} and you pinged us ${lastPingSeconds} seconds ago.`,
            readResource: (url) => `The ping was cancelled because there was an error reading the resource at URL ${url}.`
        },
        rpc: {
            notEnoughParams: (method) => `Can't call "${method}" because there aren't enough parameters.`,
            tooManyParams: (method) => `Can't call "${method}" because there are too many parameters.`
        }
    },
    log: {
        subscription: (apiUrl, displayUrl, resourceUrl, protocol) => `Subscriber <a href="${apiUrl}">${displayUrl}</a> requests notification when the <a href="${resourceUrl}">resource</a> changes via <i>${protocol}</i> protocol.`,
        ping: (resourceUrl, result) => `The <a href="${resourceUrl}">resource</a> was said to have changed. We checked and the claim appears to be ${result}.`,
        notify: (apiUrl, displayUrl, resourceUrl, protocol) => `Subscriber <a href="${apiUrl}">${displayUrl}</a> was notified that <a href="${resourceUrl}">resource</a> has changed via <i>${protocol}</i> protocol.`,
        notifyFailed: (apiUrl, displayUrl, resourceUrl, protocol) => `Failed to notify subscriber <a href="${apiUrl}">${displayUrl}</a> that <a href="${resourceUrl}">resource</a> has changed via <i>${protocol}</i> protocol.`
    },
    success: {
        subscription: 'Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!',
        ping: 'Thanks for the ping.'
    }
};
