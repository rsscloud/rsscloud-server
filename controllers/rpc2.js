(function () {
    "use strict";

    const bodyParser = require('body-parser'),
        express = require('express'),
        parseRpcRequest = require('../services/parse-rpc-request'),
        parseNotifyParams = require('../services/parse-notify-params'),
        pleaseNotify = require('../services/please-notify'),
        ping = require('../services/ping'),
        router = new express.Router(),
        rpcReturnSuccess = require('../services/rpc-return-success'),
        rpcReturnFault = require('../services/rpc-return-fault'),
        textParser = bodyParser.text({ type: '*/xml'});

    function processResponse(req, res, xmlString) {
        switch (req.accepts('xml')) {
        case 'xml':
            res.set('Content-Type', 'text/xml');
            res.send(xmlString);
            break;
        default:
            res.status(406).send('Not Acceptable');
            break;
        }
    }

    function handleError(req, res, err) {
        // console.error(err);
        processResponse(req, res, rpcReturnFault(4, err.message));
    }

    router.post('/', textParser, function (req, res) {
        parseRpcRequest(req)
            .then(request => {
                switch (request.methodName) {
                case 'rssCloud.hello':
                    console.log(request.params[0]);
                    processResponse(req, res, rpcReturnSuccess(true));
                    break;
                case 'rssCloud.pleaseNotify':
                    const params = parseNotifyParams.rpc(req, request.params);
                    pleaseNotify(
                        params.notifyProcedure,
                        params.apiurl,
                        params.protocol,
                        params.urlList,
                        params.diffDomain
                    )
                        .then(result => processResponse(req, res, rpcReturnSuccess(result.success)))
                        .catch(err => handleError(req, res, err));
                    break;
                case 'rssCloud.ping':
                    // Dave's rssCloud server always returns true whether it succeeded or not
                    ping(request.params[0])
                        .then(result => processResponse(req, res, rpcReturnSuccess(result.success)))
                        .catch(err => processResponse(req, res, rpcReturnSuccess(true)));
                    break;
                default:
                    handleError(
                        req,
                        res,
                        new Error(`Can't make the call because "${request.methodName}" is not defined.`)
                    );
                }
            })
            .catch(err => handleError(req, res, err));
    });

    module.exports = router;
}());
