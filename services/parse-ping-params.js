(function () {
    "use strict";

    var appMessages = require('./app-messages'),
        sprintf = require('sprintf-js').sprintf;

    function parsePingParams(req) {
        var s = '',
            params = {};

        if (undefined === req.body.url) {
            s += 'url, ';
        }
        if (0 === s.length) {
            params.url = req.body.url;
            return params;
        } else {
            s = s.substr(0, s.length - 2);
            throw new Error(sprintf(appMessages.error.subscription.missingParams, s));
        }
    }

    module.exports = parsePingParams;
}());
