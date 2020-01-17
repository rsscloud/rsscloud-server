(function () {
    "use strict";

    module.exports = {
        error: {
            subscription: {
                missingParams: 'The following parameters were missing from the request body: %s.',
                invalidProtocol: 'Can\'t accept the subscription because the protocol, <i>%s</i>, is unsupported.',
                readResource: 'The subscription was cancelled because there was an error reading the resource at URL %s.',
                noResources: 'No resources specified.',
                failedHandler: 'The subscription was cancelled because the call failed when we tested the handler.'
            },
            ping: {
                tooRecent: 'Can\'t accept the request because the minimum seconds between pings is %s and you pinged us %s seconds ago.',
                readResource: 'The ping was cancelled because there was an error reading the resource at URL %s.'
            }
        },
        log: {
            subscription: 'Subscriber <a href="%s">%s</a> requests notification when the <a href="%s">resource</a> changes via <i>%s</i> protocol.',
            ping: 'The <a href="%s">resource</a> was said to have changed. We checked and the claim appears to be %s.',
            notify: 'Subscriber <a href="%s">%s</a> was notified that <a href="%s">resource</a> has changed via <i>%s</i> protocol.',
            notifyFailed: 'Failed to notify subscriber <a href="%s">%s</a> that <a href="%s">resource</a> has changed via <i>%s</i> protocol.'
        },
        success: {
            subscription: 'Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!',
            ping: 'Thanks for the ping.'
        }
    };
}());
