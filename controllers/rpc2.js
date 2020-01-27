(function () {
    "use strict";

    const express = require('express'),
        parseRpcParams = require('../services/parse-rpc-params'),
        router = new express.Router(),
        rpcReturnSuccess = require('../services/rpc-return-success');

    function processResponse(req, res, result) {
        switch (req.accepts('xml')) {
        case 'xml':
            res.set('Content-Type', 'text/xml');
            res.send(rpcReturnSuccess());
            break;
        default:
            res.status(406).send('Not Acceptable');
            break;
        }
    }

    router.post('/', function (req, res) {
        const params = parseRpcParams(req);
        console.dir(params);
        processResponse(req, res, params);
    });

    module.exports = router;
}());
