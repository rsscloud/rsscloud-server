const chai = require('chai'),
    chaiHttp = require('chai-http'),
    chaiXml = require('chai-xml'),
    expect = chai.expect,
    SERVER_URL = process.env.APP_URL || 'http://localhost:5337',
    mock = require('./mock'),
    mongodb = require('./mongodb'),
    xmlrpc = require('davexmlrpc'),
    rpcReturnSuccess = require('../services/rpc-return-success'),
    rpcReturnFault = require('../services/rpc-return-fault');

chai.use(chaiHttp);
chai.use(chaiXml);

function pleaseNotify(pingProtocol, body, returnFormat) {
    if ('XML-RPC' === pingProtocol) {
        const rpctext = xmlrpc.buildCall('rssCloud.pleaseNotify', body, 'xml');

        return chai
            .request(SERVER_URL)
            .post('/RPC2')
            .set('content-type', 'text/xml')
            .send(rpctext);
    } else {
        let req = chai
            .request(SERVER_URL)
            .post('/pleaseNotify')
            .set('content-type', 'application/x-www-form-urlencoded');

        if ('JSON' === returnFormat) {
            req.set('accept', 'application/json');
        }

        return req.send(body);
    }
}

for (const protocol of ['http-post', 'https-post', 'xml-rpc']) {
    for (const returnFormat of ['XML', 'JSON']) {
        for (const pingProtocol of ['XML-RPC', 'REST']) {

            if ('XML-RPC' === pingProtocol && 'JSON' === returnFormat) {
                // Not Applicable
                continue;
            }

            describe(`PleaseNotify ${pingProtocol} to ${protocol} returning ${returnFormat}`, function() {

                before(async function() {
                    await mongodb.before();
                    await mock.before();
                });

                after(async function() {
                    await mongodb.after();
                    await mock.after();
                });

                beforeEach(async function() {
                    await mongodb.beforeEach();
                    await mock.beforeEach();
                });

                afterEach(async function() {
                    await mongodb.afterEach();
                    await mock.afterEach();
                });

                it('should accept a pleaseNotify for new resource', async function() {
                    const feedPath = '/rss.xml',
                        resourceUrl = mock.serverUrl + feedPath;

                    let pingPath = '/feedupdated',
                        notifyProcedure = false;

                    if ('xml-rpc' === protocol) {
                        pingPath = '/RPC2';
                        notifyProcedure = 'river.feedUpdated';
                    }

                    let body = {
                        domain: mock.serverDomain,
                        port: 'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                        path: pingPath,
                        notifyProcedure: notifyProcedure,
                        protocol,
                        url1: resourceUrl
                    };

                    if ('XML-RPC' === pingProtocol) {
                        body = [
                            notifyProcedure,
                            'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                            pingPath,
                            protocol,
                            [resourceUrl],
                            mock.serverDomain
                        ];
                    }

                    mock.route('GET', feedPath, 200, '<RSS Feed />');
                    mock.route('GET', pingPath, 200, (req) => {
                        return req.query.challenge;
                    });
                    mock.rpc(notifyProcedure, rpcReturnSuccess(true));

                    let res = await pleaseNotify(pingProtocol, body, returnFormat);

                    expect(res).status(200);

                    if ('XML-RPC' === pingProtocol) {
                        expect(res.text).xml.equal(rpcReturnSuccess(true));
                    } else {
                        if ('JSON' === returnFormat) {
                            expect(res.body).deep.equal({ success: true, msg: 'Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!' });
                        } else {
                            expect(res.text).xml.equal('<notifyResult success="true" msg="Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!"/>');
                        }
                    }

                    expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

                    if ('xml-rpc' === protocol) {
                        expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(1, `Missing XML-RPC call ${notifyProcedure}`);
                        expect(mock.requests.RPC2[notifyProcedure][0]).property('rpcBody');
                        expect(mock.requests.RPC2[notifyProcedure][0].rpcBody.params[0]).equal(resourceUrl);
                    } else {
                        expect(mock.requests.GET).property(pingPath).lengthOf(1, `Missing GET ${pingPath}`);
                    }
                });

                it('should accept a pleaseNotify without domain for new resource', async function() {
                    const feedPath = '/rss.xml',
                        resourceUrl = mock.serverUrl + feedPath;

                    let pingPath = '/feedupdated',
                        notifyProcedure = false;

                    if ('xml-rpc' === protocol) {
                        pingPath = '/RPC2';
                        notifyProcedure = 'river.feedUpdated';
                    }

                    let body = {
                        port: 'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                        path: pingPath,
                        notifyProcedure: notifyProcedure,
                        protocol,
                        url1: resourceUrl
                    };

                    if ('XML-RPC' === pingProtocol) {
                        body = [
                            notifyProcedure,
                            'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                            pingPath,
                            protocol,
                            [resourceUrl]
                        ];
                    }

                    mock.route('GET', feedPath, 200, '<RSS Feed />');
                    mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
                    mock.rpc(notifyProcedure, rpcReturnSuccess(true));

                    let res = await pleaseNotify(pingProtocol, body, returnFormat);

                    expect(res).status(200);

                    if ('XML-RPC' === pingProtocol) {
                        expect(res.text).xml.equal(rpcReturnSuccess(true));
                    } else {
                        if ('JSON' === returnFormat) {
                            expect(res.body).deep.equal({ success: true, msg: 'Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!' });
                        } else {
                            expect(res.text).xml.equal('<notifyResult success="true" msg="Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!"/>');
                        }
                    }

                    expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

                    if ('xml-rpc' === protocol) {
                        expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(1, `Missing XML-RPC call ${notifyProcedure}`);
                        expect(mock.requests.RPC2[notifyProcedure][0]).property('rpcBody');
                        expect(mock.requests.RPC2[notifyProcedure][0].rpcBody.params[0]).equal(resourceUrl);
                    } else {
                        expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
                    }
                });

                it('should reject a pleaseNotify for bad resource', async function() {
                    const feedPath = '/rss.xml',
                        resourceUrl = mock.serverUrl + feedPath;

                    let pingPath = '/feedupdated',
                        notifyProcedure = false;

                    if ('xml-rpc' === protocol) {
                        pingPath = '/RPC2';
                        notifyProcedure = 'river.feedUpdated';
                    }

                    let body = {
                        port: 'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                        path: pingPath,
                        notifyProcedure: notifyProcedure,
                        protocol,
                        url1: resourceUrl
                    };

                    if ('XML-RPC' === pingProtocol) {
                        body = [
                            notifyProcedure,
                            'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                            pingPath,
                            protocol,
                            [resourceUrl]
                        ];
                    }

                    mock.route('GET', feedPath, 404, 'Not Found');
                    mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
                    mock.rpc(notifyProcedure, rpcReturnSuccess(true));

                    let res = await pleaseNotify(pingProtocol, body, returnFormat);

                    expect(res).status(200);

                    if ('XML-RPC' === pingProtocol) {
                        expect(res.text).xml.equal(rpcReturnFault(4, `The subscription was cancelled because there was an error reading the resource at URL ${resourceUrl}.`));
                    } else {
                        if ('JSON' === returnFormat) {
                            expect(res.body).deep.equal({ success: false, msg: `The subscription was cancelled because there was an error reading the resource at URL ${resourceUrl}.` });
                        } else {
                            expect(res.text).xml.equal(`<notifyResult success="false" msg="The subscription was cancelled because there was an error reading the resource at URL ${resourceUrl}."/>`);
                        }
                    }

                    expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

                    if ('xml-rpc' === protocol) {
                        expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(0, `Should not XML-RPC call ${notifyProcedure}`);
                    } else {
                        expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
                    }
                });

            });

            if ('xml-rpc' === protocol) {
                // Not Applicable
                continue;
            }

            describe(`PleaseNotify ${pingProtocol} to ${protocol} via redirect returning ${returnFormat}`, function() {

                before(async function() {
                    await mongodb.before();
                    await mock.before();
                });

                after(async function() {
                    await mongodb.after();
                    await mock.after();
                });

                beforeEach(async function() {
                    await mongodb.beforeEach();
                    await mock.beforeEach();
                });

                afterEach(async function() {
                    await mongodb.afterEach();
                    await mock.afterEach();
                });

                it('should accept a pleaseNotify for a redirected subscriber', async function() {
                    const feedPath = '/rss.xml',
                        resourceUrl = mock.serverUrl + feedPath;

                    let pingPath = '/feedupdated',
                        redirPath = '/redirect',
                        notifyProcedure = false,

                        body = {
                            domain: mock.serverDomain,
                            port: 'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                            path: redirPath,
                            notifyProcedure: notifyProcedure,
                            protocol,
                            url1: resourceUrl
                        };

                    if ('XML-RPC' === pingProtocol) {
                        body = [
                            notifyProcedure,
                            'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                            redirPath,
                            protocol,
                            [resourceUrl],
                            mock.serverDomain
                        ];
                    }

                    mock.route('GET', feedPath, 200, '<RSS Feed />');
                    mock.route('GET', redirPath, 302, (_req) => {
                        return pingPath;
                    });
                    mock.route('GET', pingPath, 200, (req) => {
                        return req.query.challenge;
                    });
                    mock.rpc(notifyProcedure, rpcReturnSuccess(true));

                    let res = await pleaseNotify(pingProtocol, body, returnFormat);

                    expect(res).status(200);

                    if ('XML-RPC' === pingProtocol) {
                        expect(res.text).xml.equal(rpcReturnSuccess(true));
                    } else {
                        if ('JSON' === returnFormat) {
                            expect(res.body).deep.equal({ success: true, msg: 'Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!' });
                        } else {
                            expect(res.text).xml.equal('<notifyResult success="true" msg="Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!"/>');
                        }
                    }

                    expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
                    expect(mock.requests.GET).property(pingPath).lengthOf(1, `Missing GET ${pingPath}`);
                });

                it('should accept a pleaseNotify without domain for a redirected subscriber', async function() {
                    const feedPath = '/rss.xml',
                        resourceUrl = mock.serverUrl + feedPath;

                    let pingPath = '/feedupdated',
                        redirPath = '/redirect',
                        notifyProcedure = false,

                        body = {
                            port: 'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                            path: redirPath,
                            notifyProcedure: notifyProcedure,
                            protocol,
                            url1: resourceUrl
                        };

                    if ('XML-RPC' === pingProtocol) {
                        body = [
                            notifyProcedure,
                            'https-post' === protocol ? mock.secureServerPort : mock.serverPort,
                            redirPath,
                            protocol,
                            [resourceUrl]
                        ];
                    }

                    mock.route('GET', feedPath, 200, '<RSS Feed />');
                    mock.route('POST', redirPath, 302, (_req) => {
                        return pingPath;
                    });
                    mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
                    mock.rpc(notifyProcedure, rpcReturnSuccess(true));

                    let res = await pleaseNotify(pingProtocol, body, returnFormat);

                    expect(res).status(200);

                    if ('XML-RPC' === pingProtocol) {
                        expect(res.text).xml.equal(rpcReturnSuccess(true));
                    } else {
                        if ('JSON' === returnFormat) {
                            expect(res.body).deep.equal({ success: true, msg: 'Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!' });
                        } else {
                            expect(res.text).xml.equal('<notifyResult success="true" msg="Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!"/>');
                        }
                    }

                    expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
                    expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
                });

            });

        } // end for pingProtocol
    } // end for returnFormat
} // end for protocol
