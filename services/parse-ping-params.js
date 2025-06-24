const appMessages = require('./app-messages'),
    ErrorResponse = require('./error-response'),
    sprintf = require('sprintf-js').sprintf;

function rest(req) {
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
        throw new ErrorResponse(sprintf(appMessages.error.subscription.missingParams, s));
    }
}

function rpc(req, rpcParams) {
    let params = {};

    if (1 > rpcParams.length) {
        throw new ErrorResponse(sprintf(appMessages.error.rpc.notEnoughParams, 'ping'));
    } else if (1 < rpcParams.length) {
        throw new ErrorResponse(sprintf(appMessages.error.rpc.tooManyParams, 'ping'));
    }

    params.url = rpcParams[0];

    return params;
}

module.exports = { rest, rpc };
