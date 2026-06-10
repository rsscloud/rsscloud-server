import { Parser } from 'xml2js';
import { describe, expect, it } from 'vitest';
import type {
    PingRequest,
    PingResponse,
    SubscribeRequest,
    SubscribeResponse
} from '../engine/dto.js';
import { createRestDispatcher } from './rest-dispatcher.js';

interface FakeCore {
    subscribe(req: SubscribeRequest): Promise<SubscribeResponse>;
    ping(req: PingRequest): Promise<PingResponse>;
    subscribeCalls: SubscribeRequest[];
    pingCalls: PingRequest[];
}

function fakeCore(overrides: Partial<FakeCore> = {}): FakeCore {
    const core: FakeCore = {
        subscribeCalls: [],
        pingCalls: [],
        async subscribe(req) {
            core.subscribeCalls.push(req);
            return { success: true, message: 'Subscription confirmed.' };
        },
        async ping(req) {
            core.pingCalls.push(req);
            return { success: true, message: 'Thanks for the ping.' };
        },
        ...overrides
    };
    return core;
}

describe('createRestDispatcher ping', () => {
    it('maps the url and renders a JSON success envelope', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.ping(
            { url: 'http://feed.example/rss' },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(res.status).toBe(200);
        expect(res.contentType).toBe('application/json');
        expect(JSON.parse(res.body)).toEqual({
            success: true,
            msg: 'Thanks for the ping.'
        });
        expect(core.pingCalls).toEqual([
            { resourceUrl: 'http://feed.example/rss' }
        ]);
    });

    it('renders an XML success envelope under a <result> element', async () => {
        const dispatcher = createRestDispatcher({ core: fakeCore() });

        const res = await dispatcher.ping(
            { url: 'http://feed.example/rss' },
            { clientAddress: '203.0.113.5', format: 'xml' }
        );

        expect(res.status).toBe(200);
        expect(res.contentType).toBe('text/xml');
        const parsed = await new Parser().parseStringPromise(res.body);
        expect(parsed.result.$).toEqual({
            success: 'true',
            msg: 'Thanks for the ping.'
        });
    });

    it('returns 406 when no format could be negotiated', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.ping(
            { url: 'http://feed.example/rss' },
            { clientAddress: '203.0.113.5', format: null }
        );

        expect(res.status).toBe(406);
        expect(res.contentType).toBe('text/plain');
        expect(res.body).toBe('Not Acceptable');
        // The use case still runs — negotiation happens at render time, as the
        // server controllers do (run, then format). Only the reply is declined.
        expect(core.pingCalls).toHaveLength(1);
    });

    it('renders success:false on a missing url without calling core', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.ping(
            {},
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(JSON.parse(res.body)).toEqual({
            success: false,
            msg: 'The following parameters were missing from the request body: url.'
        });
        expect(core.pingCalls).toHaveLength(0);
    });

    it('relays a core ping failure as success:false (REST surfaces failures)', async () => {
        const core = fakeCore({
            async ping() {
                throw new Error(
                    'The resource at http://feed.example/rss could not be read.'
                );
            }
        });
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.ping(
            { url: 'http://feed.example/rss' },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(JSON.parse(res.body)).toEqual({
            success: false,
            msg: 'The resource at http://feed.example/rss could not be read.'
        });
    });

    it('renders a failure as XML with success="false"', async () => {
        const dispatcher = createRestDispatcher({ core: fakeCore() });

        const res = await dispatcher.ping(
            {},
            { clientAddress: '203.0.113.5', format: 'xml' }
        );

        expect(res.contentType).toBe('text/xml');
        const parsed = await new Parser().parseStringPromise(res.body);
        expect(parsed.result.$).toEqual({
            success: 'false',
            msg: 'The following parameters were missing from the request body: url.'
        });
    });
});

describe('createRestDispatcher pleaseNotify', () => {
    it('maps an explicit-domain subscription and renders JSON success', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.pleaseNotify(
            {
                domain: 'sub.example.com',
                port: '5337',
                path: '/feedupdated',
                protocol: 'http-post',
                url1: 'http://feed.example/rss'
            },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(res.status).toBe(200);
        expect(res.contentType).toBe('application/json');
        expect(JSON.parse(res.body)).toEqual({
            success: true,
            msg: 'Subscription confirmed.'
        });
        expect(core.subscribeCalls).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'http://sub.example.com:5337/feedupdated',
                protocol: 'http-post',
                diffDomain: true
            }
        ]);
    });

    it('maps an xml-rpc subscription and renders XML under <notifyResult>', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.pleaseNotify(
            {
                domain: 'sub.example.com',
                port: '5337',
                path: '/RPC2',
                protocol: 'xml-rpc',
                notifyProcedure: 'river.feedUpdated',
                url1: 'http://feed.example/rss'
            },
            { clientAddress: '203.0.113.5', format: 'xml' }
        );

        expect(res.contentType).toBe('text/xml');
        const parsed = await new Parser().parseStringPromise(res.body);
        expect(parsed.notifyResult.$).toEqual({
            success: 'true',
            msg: 'Subscription confirmed.'
        });
        expect(core.subscribeCalls).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'http://sub.example.com:5337/RPC2',
                protocol: 'xml-rpc',
                notifyProcedure: 'river.feedUpdated',
                diffDomain: true
            }
        ]);
    });

    it('falls back to the client address, strips ::ffff:, adds a path slash, collects every url*', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        await dispatcher.pleaseNotify(
            {
                port: '8080',
                path: 'callback',
                protocol: 'https-post',
                url1: 'http://a.example/rss',
                URL2: 'http://b.example/rss'
            },
            { clientAddress: '::ffff:198.51.100.7', format: 'json' }
        );

        expect(core.subscribeCalls).toEqual([
            {
                resourceUrls: ['http://a.example/rss', 'http://b.example/rss'],
                callbackUrl: 'https://198.51.100.7:8080/callback',
                protocol: 'https-post',
                diffDomain: false
            }
        ]);
    });

    it('infers https from port 443 and brackets a bare IPv6 domain', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        await dispatcher.pleaseNotify(
            {
                domain: '::1',
                port: '443',
                path: '/cb',
                protocol: 'http-post',
                url1: 'http://feed.example/rss'
            },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(core.subscribeCalls[0]?.callbackUrl).toBe(
            'https://[::1]:443/cb'
        );
    });

    it('renders success:false listing every missing required param', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.pleaseNotify(
            { url1: 'http://feed.example/rss' },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(JSON.parse(res.body)).toEqual({
            success: false,
            msg: 'The following parameters were missing from the request body: port, path, protocol.'
        });
        expect(core.subscribeCalls).toHaveLength(0);
    });

    it('renders success:false on an unsupported protocol', async () => {
        const core = fakeCore();
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.pleaseNotify(
            {
                port: '80',
                path: '/cb',
                protocol: 'ftp',
                url1: 'http://feed.example/rss'
            },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(JSON.parse(res.body)).toEqual({
            success: false,
            msg: 'Can\'t accept the subscription because the protocol, <i>ftp</i>, is unsupported.'
        });
        expect(core.subscribeCalls).toHaveLength(0);
    });

    it('surfaces the first failed resource error when the subscribe fails', async () => {
        const core = fakeCore({
            async subscribe() {
                return {
                    success: false,
                    message: 'Subscription could not be confirmed for any resource.',
                    results: [
                        {
                            resourceUrl: 'http://feed.example/rss',
                            success: false,
                            error: 'The resource at http://feed.example/rss could not be read.'
                        }
                    ]
                };
            }
        });
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.pleaseNotify(
            {
                port: '80',
                path: '/cb',
                protocol: 'http-post',
                url1: 'http://feed.example/rss'
            },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(JSON.parse(res.body)).toEqual({
            success: false,
            msg: 'The resource at http://feed.example/rss could not be read.'
        });
    });

    it('falls back to the summary message when the failure carries no results', async () => {
        const core = fakeCore({
            async subscribe() {
                return { success: false, message: 'Nothing worked.' };
            }
        });
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.pleaseNotify(
            {
                port: '80',
                path: '/cb',
                protocol: 'http-post',
                url1: 'http://feed.example/rss'
            },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(JSON.parse(res.body)).toEqual({
            success: false,
            msg: 'Nothing worked.'
        });
    });

    it('falls back to the summary message when no failed resource has an error', async () => {
        const core = fakeCore({
            async subscribe() {
                return {
                    success: false,
                    message: 'Nothing worked.',
                    results: [
                        {
                            resourceUrl: 'http://feed.example/rss',
                            success: false
                        }
                    ]
                };
            }
        });
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.pleaseNotify(
            {
                port: '80',
                path: '/cb',
                protocol: 'http-post',
                url1: 'http://feed.example/rss'
            },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(JSON.parse(res.body)).toEqual({
            success: false,
            msg: 'Nothing worked.'
        });
    });

    it('relays a non-Error thrown value as its string form', async () => {
        const core = fakeCore({
            async subscribe() {
                throw 'plain string failure';
            }
        });
        const dispatcher = createRestDispatcher({ core });

        const res = await dispatcher.pleaseNotify(
            {
                port: '80',
                path: '/cb',
                protocol: 'http-post',
                url1: 'http://feed.example/rss'
            },
            { clientAddress: '203.0.113.5', format: 'json' }
        );

        expect(JSON.parse(res.body)).toEqual({
            success: false,
            msg: 'plain string failure'
        });
    });
});
