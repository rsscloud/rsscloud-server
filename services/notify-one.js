(function () {
    "use strict";

    var request = require('request-promise');

    async function notifyOne(resourceUrl, apiurl) {
        const res = await request({
                method: 'POST',
                uri: apiurl,
                data: {
                    'url': resourceUrl
                },
                resolveWithFullResponse: true
            });

        if (res.statusCode < 200 || res.statusCode > 299) {
            throw new Error('Notification Failed');
        }
    }

    module.exports = notifyOne;
}());
