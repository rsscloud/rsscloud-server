const chai = require("chai"),
    chaiHttp = require("chai-http"),
    chaiXml = require("chai-xml"),
    expect = chai.expect,
    SERVER_URL = process.env.APP_URL || "http://localhost:5337",
    mock = require("./mock"),
    mongodb = require("./mongodb"),
    xmlrpc = require("davexmlrpc");

chai.use(chaiHttp);
chai.use(chaiXml);

function pleaseNotify(pingProtocol, body, returnFormat) {
    if ('XML-RPC' === pingProtocol) {
        // const rpctext = xmlrpc.buildCall('rssCloud.ping', [resourceUrl], 'xml');

        // return chai
        //     .request(SERVER_URL)
        //     .post("/RPC2")
        //     .set('content-type', 'text/xml')
        //     .send(rpctext);
    } else {
        let req = chai
            .request(SERVER_URL)
            .post("/pleaseNotify")
            .set('content-type', 'application/x-www-form-urlencoded');

        if ('JSON' === returnFormat) {
            req.set('accept', 'application/json');
        }

        return req.send(body);
    }
}

for (const protocol of ['http-post', 'https-post']) {
for (const returnFormat of ['XML', 'JSON']) {
for (const pingProtocol of ['REST']) {

    if ('XML-RPC' === pingProtocol && 'JSON' === returnFormat) {
        // Not Applicable
        continue;
    }

    describe(`PleaseNotify ${pingProtocol} to ${protocol} returning ${returnFormat}`, () => {

        before(async () => {
            await mongodb.before();
            await mock.before();
        });

        after(async () => {
            await mongodb.after();
            await mock.after();
        });

        beforeEach(async () => {
            await mongodb.beforeEach();
            await mock.beforeEach();
        });

        afterEach(async () => {
            await mongodb.afterEach();
            await mock.afterEach();
        });

        it('should accept a pleaseNotify for new resource', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let body = {
                domain: mock.serverDomain,
                port: 'http-post' === protocol ? mock.serverPort : mock.secureServerPort,
                path: pingPath,
                notifyProcedure: false,
                protocol,
                url1: resourceUrl
            };

            if ('xml-rpc' === protocol) {
                // body = {}
            }

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('GET', pingPath, 200, (req) => { return req.query.challenge; });

            let res = await pleaseNotify(pingProtocol, body, returnFormat);

            expect(res).status(200);

            if ('JSON' === returnFormat) {
                expect(res.body).deep.equal({ success: true, msg: `Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!` });
            } else {
                expect(res.text).xml.equal('<notifyResult success="true" msg="Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!"/>');
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
            expect(mock.requests.GET).property(pingPath).lengthOf(1, `Missing GET ${pingPath}`);
        });

        it('should accept a pleaseNotify without domain for new resource', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let body = {
                port: 'http-post' === protocol ? mock.serverPort : mock.secureServerPort,
                path: pingPath,
                notifyProcedure: false,
                protocol,
                url1: resourceUrl
            };

            if ('xml-rpc' === protocol) {
                // body = {}
            }

            mock.route('GET', feedPath, 200, '<RSS Feed />');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');

            let res = await pleaseNotify(pingProtocol, body, returnFormat);

            expect(res).status(200);

            if ('JSON' === returnFormat) {
                expect(res.body).deep.equal({ success: true, msg: `Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!` });
            } else {
                expect(res.text).xml.equal('<notifyResult success="true" msg="Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!"/>');
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
        });

        // it('should accept a pleaseNotify for new resource and return JSON', async () => {
        //     const feedPath = '/rss.xml',
        //         pingPath = '/feedupdated',
        //         resourceUrl = mock.serverUrl + feedPath,
        //         notifyProcedure = false,
        //         apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath;

        //     mock.route('GET', feedPath, 200, '<RSS Feed />');
        //     mock.route('GET', pingPath, 200, (req) => { return req.query.challenge; });

        //     let res = await chai
        //         .request(SERVER_URL)
        //         .post("/pleaseNotify")
        //         .set('accept', 'application/json')
        //         .set('content-type', 'application/x-www-form-urlencoded')
        //         .send({
        //             domain: 'rsscloud-tests',
        //             port: 8002,
        //             path: pingPath,
        //             notifyProcedure: false,
        //             protocol,
        //             url1: resourceUrl
        //         });

        //     expect(res).status(200);
        //     expect(res.body).deep.equal({ success: true, msg: `Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!` });
        //     expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
        //     expect(mock.requests.GET).property(pingPath).lengthOf(1, `Missing GET ${pingPath}`);
        // });

        // it('should accept a pleaseNotify without domain for new resource and return JSON', async () => {
        //     const feedPath = '/rss.xml',
        //         pingPath = '/feedupdated',
        //         resourceUrl = mock.serverUrl + feedPath,
        //         notifyProcedure = false,
        //         apiurl = ('http-post' === protocol ? mock.serverUrl : mock.secureServerUrl) + pingPath;

        //     mock.route('GET', feedPath, 200, '<RSS Feed />');
        //     mock.route('POST', pingPath, 200, '');

        //     let res = await chai
        //         .request(SERVER_URL)
        //         .post("/pleaseNotify")
        //         .set('accept', 'application/json')
        //         .set('content-type', 'application/x-www-form-urlencoded')
        //         .send({
        //             port: 8002,
        //             path: pingPath,
        //             notifyProcedure: false,
        //             protocol,
        //             url1: resourceUrl
        //         });

        //     expect(res).status(200);
        //     expect(res.body).deep.equal({ success: true, msg: `Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!` });
        //     expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
        //     expect(mock.requests.POST).property(pingPath).lengthOf(1, `Missing POST ${pingPath}`);
        // });

        it('should reject a pleaseNotify for bad resource', async () => {
            const feedPath = '/rss.xml',
                pingPath = '/feedupdated',
                resourceUrl = mock.serverUrl + feedPath;

            let body = {
                port: 'http-post' === protocol ? mock.serverPort : mock.secureServerPort,
                path: pingPath,
                notifyProcedure: false,
                protocol,
                url1: resourceUrl
            };

            if ('xml-rpc' === protocol) {
                // body = {}
            }

            mock.route('GET', feedPath, 404, 'Not Found');
            mock.route('POST', pingPath, 200, 'Thanks for the update! :-)');

            let res = await pleaseNotify(pingProtocol, body, returnFormat);

            expect(res).status(200);

            if ('JSON' === returnFormat) {
                expect(res.body).deep.equal({ success: false, msg: `The subscription was cancelled because there was an error reading the resource at URL ${resourceUrl}.` });
            } else {
                expect(res.text).xml.equal(`<notifyResult success="false" msg="The subscription was cancelled because there was an error reading the resource at URL ${resourceUrl}."/>`);
            }

            expect(mock.requests.GET).property(feedPath).lengthOf(1, `Missing GET ${feedPath}`);
            expect(mock.requests.POST).property(pingPath).lengthOf(0, `Should not POST ${pingPath}`);
        });
    });

} // end for pingProtocol
} // end for returnFormat
} // end for protocol
