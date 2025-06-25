
const bodyParser = require('body-parser'),
    ErrorResponse = require('../services/error-response'),
    express = require('express'),
    getDayjs = require('../services/dayjs-wrapper'),
    logEvent = require('../services/log-event'),
    parseRpcRequest = require('../services/parse-rpc-request'),
    parseNotifyParams = require('../services/parse-notify-params'),
    parsePingParams = require('../services/parse-ping-params'),
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
    if (!(err instanceof ErrorResponse)) {
        console.error(err);
    }
    processResponse(req, res, rpcReturnFault(4, err.message));
}

router.post('/', textParser, async function(req, res) {
    let params;
    const dayjs = await getDayjs();

    try {
        const request = await parseRpcRequest(req);

        logEvent(
            'XmlRpc',
            request.methodName,
            dayjs().format('x')
        );

        switch (request.methodName) {
        case 'rssCloud.hello':
            processResponse(req, res, rpcReturnSuccess(true));
            break;
        case 'rssCloud.pleaseNotify':
            try {
                params = parseNotifyParams.rpc(req, request.params);
                const result = await pleaseNotify(
                    params.notifyProcedure,
                    params.apiurl,
                    params.protocol,
                    params.urlList,
                    params.diffDomain
                );
                processResponse(req, res, rpcReturnSuccess(result.success));
            } catch (err) {
                handleError(req, res, err);
            }
            break;
        case 'rssCloud.ping':
            try {
                params = parsePingParams.rpc(req, request.params);
                // Dave's rssCloud server always returns true whether it succeeded or not
                try {
                    const result = await ping(params.url);
                    processResponse(req, res, rpcReturnSuccess(result.success));
                } catch {
                    processResponse(req, res, rpcReturnSuccess(true));
                }
            } catch (err) {
                handleError(req, res, err);
            }
            break;
        default:
            handleError(
                req,
                res,
                new Error(`Can't make the call because "${request.methodName}" is not defined.`)
            );
        }
    } catch (err) {
        handleError(req, res, err);
    }
});

module.exports = router;
