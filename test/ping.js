const chai = require("chai"),
    chaiHttp = require("chai-http"),
    chaiXml = require("chai-xml"),
    config = require('../config'),
    expect = chai.expect,
    SERVER_URL = process.env.APP_URL || "http://localhost:5337",
    mock = require("./mock"),
    moment = require('moment'),
    mongodb = require("./mongodb"),
    xmlrpc = require("davexmlrpc"),
    rpcReturnSuccess = require('../services/rpc-return-success'),
    rpcReturnFault = require('../services/rpc-return-fault');

chai.use(chaiHttp);
chai.use(chaiXml);

function ping(pingProtocol, resourceUrl, returnFormat) {
    if ('XML-RPC' === pingProtocol) {
        let rpctext;
        if (null == resourceUrl) {
            rpctext = xmlrpc.buildCall('rssCloud.ping', [], 'xml');
        } else {
            rpctext = xmlrpc.buildCall('rssCloud.ping', [resourceUrl], 'xml');
        }

        return chai
            .request(SERVER_URL)
            .post("/RPC2")
            .set('content-type', 'text/xml')
            .send(rpctext);
    } else {
        let req = chai
            .request(SERVER_URL)
            .post("/ping")
            .set('content-type', 'application/x-www-form-urlencoded');

        if ('JSON' === returnFormat) {
            req.set('accept', 'application/json');
        }

        if (null == resourceUrl) {
            return req.send({});
        } else {
            return req.send({ url: resourceUrl });
        }
    }
}

for (const protocol of ['http-post', 'https-post', 'xml-rpc']) {
for (const returnFormat of ['XML', 'JSON']) {
for (const pingProtocol of ['XML-RPC', 'REST']) {

    if ('XML-RPC' === pingProtocol && 'JSON' === returnFormat) {
        // Not Applicable
        continue;
    }

    describe(`Ping ${pingProtocol} to ${protocol} returning ${returnFormat}`, function () {
        before(async function () {
            await mongodb.before();
            await mock.before();
        });

        after(async function () {
            await mongodb.after();
            await mock.after();
        });

        beforeEach(async function () {
            await mongodb.beforeEach();
            await mock.beforeEach();
        });

        afterEach(async function () {
            await mongodb.afterEach();
            await mock.afterEach();
        });

        it(`should accept a ping for new resource`, async function () {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                notifyProcedure = false;

            if ('xml-rpc' === protocol) {
                apiurl = mock.serverUrl + '/RPC2';
                notifyProcedure = 'river.feedUpdated';
            }

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mock.rpc(notifyProcedure, rpcReturnSuccess(true));
            await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnSuccess(true));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
                } else {
                    expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
                }
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

            if ('xml-rpc' === protocol) {
                expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(1, `Missing XML-RPC call ${notifyProcedure}`);
                expect(mock.requests.RPC2[notifyProcedure][0]).property('rpcBody');
                expect(mock.requests.RPC2[notifyProcedure][0].rpcBody.params[0]).equal(resourceUrl);
            } else {
                expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
                expect(mock.requests.POST[pingPath][0]).property('body');
                expect(mock.requests.POST[pingPath][0].body).property('url');
                expect(mock.requests.POST[pingPath][0].body.url).equal(resourceUrl);
            }
        });

        it('should reject a ping for bad resource', async function () {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                notifyProcedure = false;

            if ('xml-rpc' === protocol) {
                apiurl = mock.serverUrl + '/RPC2';
                notifyProcedure = 'river.feedUpdated';
            }

            mock.route('GET', feedPath, 404, 'Not Found');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mock.rpc(notifyProcedure, rpcReturnSuccess(true));
            await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnSuccess(true));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: false, msg: `The ping was cancelled because there was an error reading the resource at URL ${resourceUrl}.` });
                } else {
                    expect(res.text).xml.equal(`<result success="false" msg="The ping was cancelled because there was an error reading the resource at URL ${resourceUrl}."/>`);
                }
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

            if ('xml-rpc' === protocol) {
                expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(0, `Should not XML-RPC call ${notifyProcedure}`);
            } else {
                expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
            }
        });

        it('should reject a ping with a missing url', async function () {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = null;

            let apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                notifyProcedure = false;

            if ('xml-rpc' === protocol) {
                apiurl = mock.serverUrl + '/RPC2';
                notifyProcedure = 'river.feedUpdated';
            }

            mock.route('GET', feedPath, 404, 'Not Found');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mock.rpc(notifyProcedure, rpcReturnSuccess(true));

            let res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnFault(4, 'Can\'t call "ping" because there aren\'t enough parameters.'));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: false, msg: `The following parameters were missing from the request body: url.` });
                } else {
                    expect(res.text).xml.equal(`<result success="false" msg="The following parameters were missing from the request body: url."/>`);
                }
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(0, `Should not GET ${feedPath}`);

            if ('xml-rpc' === protocol) {
                expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(0, `Should not XML-RPC call ${notifyProcedure}`);
            } else {
                expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
            }
        });

        it('should accept a ping for unchanged resource', async function () {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                notifyProcedure = false;

            if ('xml-rpc' === protocol) {
                apiurl = mock.serverUrl + '/RPC2';
                notifyProcedure = 'river.feedUpdated';
            }

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mock.rpc(notifyProcedure, rpcReturnSuccess(true));
            await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnSuccess(true));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
                } else {
                    expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
                }
            }

            res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnSuccess(true));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
                } else {
                    expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
                }
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(2, `Missing GET ${feedPath}`);

            if ('xml-rpc' === protocol) {
                expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(1, `Should only XML-RPC call ${notifyProcedure} once`);
            } else {
                expect(mock.requests.POST).property(pingPath).lengthOf(1, `Should only POST ${pingPath} once`);
            }
        });

        it(`should accept a ping with slow subscribers`, async function () {
            this.timeout(5000);

            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                notifyProcedure = false;

            if ('xml-rpc' === protocol) {
                apiurl = mock.serverUrl + '/RPC2';
                notifyProcedure = 'river.feedUpdated';
            }

            function slowPostResponse(req) {
                return new Promise(function(resolve) {
                    setTimeout(function () {
                        resolve('Thanks for the update! :-)');
                    }, 1000);
                });
            }

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            if ('xml-rpc' === protocol) {
                mock.rpc(notifyProcedure, rpcReturnSuccess(true));
                await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);
            } else {
                for (let i = 0; i < 10; i++) {
                    mock.route('POST', pingPath + i, 200, slowPostResponse);
                    await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl + i, protocol);
                }
            }

            let res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnSuccess(true));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
                } else {
                    expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
                }
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

            if ('xml-rpc' === protocol) {
                expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(1, `Missing XML-RPC call ${notifyProcedure}`);
                expect(mock.requests.RPC2[notifyProcedure][0]).property('rpcBody');
                expect(mock.requests.RPC2[notifyProcedure][0].rpcBody.params[0]).equal(resourceUrl);
            } else {
                for (let i = 0; i < 10; i++) {
                    expect(mock.requests.POST).property(pingPath + i).lengthOf(1, `Missing POST ${pingPath + i}`);
                    expect(mock.requests.POST[pingPath + i][0]).property('body');
                    expect(mock.requests.POST[pingPath + i][0].body).property('url');
                    expect(mock.requests.POST[pingPath + i][0].body.url).equal(resourceUrl);
                }
            }
        });

        it(`should not notify expired subscribers`, async function () {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                notifyProcedure = false;

            if ('xml-rpc' === protocol) {
                apiurl = mock.serverUrl + '/RPC2';
                notifyProcedure = 'river.feedUpdated';
            }

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mock.rpc(notifyProcedure, rpcReturnSuccess(true));
            const subscription = await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);
            subscription.whenExpires = moment().utc().subtract(config.ctSecsResourceExpire * 2, 'seconds').format();
            await mongodb.updateSubscription(resourceUrl, subscription);

            let res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnSuccess(true));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
                } else {
                    expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
                }
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

            if ('xml-rpc' === protocol) {
                expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(0, `Missing XML-RPC call ${notifyProcedure}`);
            } else {
                expect(mock.requests.POST).property(pingPath).lengthOf(0, `Missing POST ${pingPath}`);
            }
        });

        it(`should not notify subscribers with excessive errors`, async function () {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                notifyProcedure = false;

            if ('xml-rpc' === protocol) {
                apiurl = mock.serverUrl + '/RPC2';
                notifyProcedure = 'river.feedUpdated';
            }

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');
            mock.rpc(notifyProcedure, rpcReturnSuccess(true));
            const subscription = await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);
            subscription.ctConsecutiveErrors = config.maxConsecutiveErrors;
            await mongodb.updateSubscription(resourceUrl, subscription);

            let res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnSuccess(true));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
                } else {
                    expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
                }
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

            if ('xml-rpc' === protocol) {
                expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(0, `Missing XML-RPC call ${notifyProcedure}`);
            } else {
                expect(mock.requests.POST).property(pingPath).lengthOf(0, `Missing POST ${pingPath}`);
            }
        });

        it(`should consider a very slow subscription an error`, async function () {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath,
                notifyProcedure = false;

            if ('xml-rpc' === protocol) {
                apiurl = mock.serverUrl + '/RPC2';
                notifyProcedure = 'river.feedUpdated';
            }

            function slowRestResponse(req) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve('Thanks for the update! :-)');
                    }, 8000)
                });
            }

            function slowRpcResponse(req) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(rpcReturnSuccess(true));
                    }, 8000)
                });
            }

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, slowRestResponse);
            mock.rpc(notifyProcedure, slowRpcResponse);
            await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);

            let res = await ping(pingProtocol, resourceUrl, returnFormat);

            expect(res).status(200);

            const subscription = await mongodb.addSubscription(resourceUrl, notifyProcedure, apiurl, protocol);
            expect(subscription.ctConsecutiveErrors).equal(1);

            if ('XML-RPC' === pingProtocol) {
                expect(res.text).xml.equal(rpcReturnSuccess(true));
            } else {
                if ('JSON' === returnFormat) {
                    expect(res.body).deep.equal({ success: true, msg: 'Thanks for the ping.' });
                } else {
                    expect(res.text).xml.equal('<result success="true" msg="Thanks for the ping."/>');
                }
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);

            if ('xml-rpc' === protocol) {
                expect(mock.requests.RPC2).property(notifyProcedure).lengthOf(1, `Missing XML-RPC call ${notifyProcedure}`);
                expect(mock.requests.RPC2[notifyProcedure][0]).property('rpcBody');
                expect(mock.requests.RPC2[notifyProcedure][0].rpcBody.params[0]).equal(resourceUrl);
            } else {
                expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
                expect(mock.requests.POST[pingPath][0]).property('body');
                expect(mock.requests.POST[pingPath][0].body).property('url');
                expect(mock.requests.POST[pingPath][0].body.url).equal(resourceUrl);
            }
        });

    });

} // end for pingProtocol
} // end for returnFormat
} // end for protocol
