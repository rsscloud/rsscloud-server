(function () {
    "use strict";

    const bodyParser = require('body-parser'),
        ErrorResponse = require('../services/error-response'),
        errorResult = require('../services/error-result'),
        express = require('express'),
        parsePingParams = require('../services/parse-ping-params'),
        ping = require('../services/ping'),
        restReturnSuccess = require('../services/rest-return-success'),
        router = new express.Router(),
        urlencodedParser = bodyParser.urlencoded({ extended: false });

    function processResponse(req, res, result) {
        switch (req.accepts('xml', 'json')) {
        case 'xml':
            res.set('Content-Type', 'text/xml');
            res.send(restReturnSuccess(
                result.success,
                result.msg,
                'result'
            ));
            break;
        case 'json':
            res.json(result);
            break;
        default:
            res.status(406).send('Not Acceptable');
            break;
        }
    }

    function handleError(req, res, err) {
        if (!(err instanceof ErrorResponse)) {
            console.error(err);
        }
        processResponse(req, res, errorResult(err.message));
    }

    router.post('/', urlencodedParser, function (req, res) {
        try {
            const params = parsePingParams.rest(req);
            ping(params.url)
                .then(result => processResponse(req, res, result))
                .catch(err => handleError(req, res, err));
        } catch (err) {
            return handleError(req, res, err);
        }
    });

    module.exports = router;
}());
