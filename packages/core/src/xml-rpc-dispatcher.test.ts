import { Builder, Parser } from 'xml2js';
import { describe, expect, it } from 'vitest';
import type {
    PingRequest,
    PingResponse,
    SubscribeRequest,
    SubscribeResponse
} from './dto.js';
import { createXmlRpcDispatcher } from './xml-rpc-dispatcher.js';

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
            return { success: true, message: 'ok' };
        },
        async ping(req) {
            core.pingCalls.push(req);
            return { success: true, message: 'ok' };
        },
        ...overrides
    };
    return core;
}

/** Render a positional param value: arrays become `<array>`, scalars bare strings. */
function valueNode(value: unknown): unknown {
    if (Array.isArray(value)) {
        return {
            array: { data: { value: value.map((item) => String(item)) } }
        };
    }
    return String(value);
}

/** Build a methodCall document for `method` with the given positional params. */
function methodCall(method: string, params: unknown[]): string {
    return new Builder().buildObject({
        methodCall: {
            methodName: method,
            params: { param: params.map((p) => ({ value: valueNode(p) })) }
        }
    });
}

interface ParsedResponse {
    methodResponse: {
        params?: { param: { value: { boolean: string } } };
        fault?: {
            value: {
                struct: {
                    member: { name: string; value: Record<string, string> }[];
                };
            };
        };
    };
}

async function parseResponse(xml: string): Promise<ParsedResponse> {
    return (await new Parser({ explicitArray: false }).parseStringPromise(
        xml
    )) as ParsedResponse;
}

function isSuccess(parsed: ParsedResponse): boolean | undefined {
    return parsed.methodResponse.params?.param.value.boolean === '1';
}

function faultString(parsed: ParsedResponse): string | undefined {
    return parsed.methodResponse.fault?.value.struct.member[1]?.value['string'];
}

describe('createXmlRpcDispatcher hello', () => {
    it('answers rssCloud.hello with success without touching core', async () => {
        const core = fakeCore();
        const dispatcher = createXmlRpcDispatcher({ core });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.hello', []),
            { clientAddress: '203.0.113.5' }
        );

        expect(isSuccess(await parseResponse(out))).toBe(true);
        expect(core.subscribeCalls).toHaveLength(0);
        expect(core.pingCalls).toHaveLength(0);
    });

    it('faults on an unknown method', async () => {
        const dispatcher = createXmlRpcDispatcher({ core: fakeCore() });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.goodbye', []),
            { clientAddress: '203.0.113.5' }
        );

        expect(faultString(await parseResponse(out))).toBe(
            'Can\'t make the call because "rssCloud.goodbye" is not defined.'
        );
    });

    it('faults on a malformed body', async () => {
        const dispatcher = createXmlRpcDispatcher({ core: fakeCore() });

        const out = await dispatcher.dispatch('<methodCall>', {
            clientAddress: '203.0.113.5'
        });

        expect(faultString(await parseResponse(out))).toBeDefined();
    });
});

describe('createXmlRpcDispatcher pleaseNotify', () => {
    it('maps an explicit-domain xml-rpc subscription and relays success', async () => {
        const core = fakeCore();
        const dispatcher = createXmlRpcDispatcher({ core });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                'myCloud.notify',
                '5337',
                '/RPC2',
                'xml-rpc',
                'http://feed.example/rss',
                'sub.example.com'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(isSuccess(await parseResponse(out))).toBe(true);
        expect(core.subscribeCalls).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'http://sub.example.com:5337/RPC2',
                protocol: 'xml-rpc',
                notifyProcedure: 'myCloud.notify',
                diffDomain: true
            }
        ]);
    });

    it('uses the client address when no domain is given (https-post, path gets a slash)', async () => {
        const core = fakeCore();
        const dispatcher = createXmlRpcDispatcher({ core });

        await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                '',
                '8080',
                'callback',
                'https-post',
                'http://feed.example/rss'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(core.subscribeCalls).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://203.0.113.5:8080/callback',
                protocol: 'https-post',
                diffDomain: false
            }
        ]);
    });

    it('infers https from port 443 and strips a ::ffff: client prefix', async () => {
        const core = fakeCore();
        const dispatcher = createXmlRpcDispatcher({ core });

        await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                '',
                '443',
                '/cb',
                'http-post',
                'http://feed.example/rss'
            ]),
            { clientAddress: '::ffff:198.51.100.7' }
        );

        expect(core.subscribeCalls[0]?.callbackUrl).toBe(
            'https://198.51.100.7:443/cb'
        );
    });

    it('brackets a bare IPv6 domain, coerces an array urlList, omits a blank xml-rpc procedure', async () => {
        const core = fakeCore();
        const dispatcher = createXmlRpcDispatcher({ core });

        await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                '',
                '5337',
                '/RPC2',
                'xml-rpc',
                ['http://a.example/rss', 'http://b.example/rss'],
                '::1'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(core.subscribeCalls).toEqual([
            {
                resourceUrls: ['http://a.example/rss', 'http://b.example/rss'],
                callbackUrl: 'http://[::1]:5337/RPC2',
                protocol: 'xml-rpc',
                diffDomain: true
            }
        ]);
    });

    it('relays a subscribe failure as boolean false', async () => {
        const core = fakeCore({
            async subscribe() {
                return { success: false, message: 'no' };
            }
        });
        const dispatcher = createXmlRpcDispatcher({ core });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                '',
                '80',
                '/cb',
                'http-post',
                'http://feed.example/rss'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(isSuccess(await parseResponse(out))).toBe(false);
    });

    it('faults when there are too few params', async () => {
        const dispatcher = createXmlRpcDispatcher({ core: fakeCore() });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', ['', '80', '/cb', 'http-post']),
            { clientAddress: '203.0.113.5' }
        );

        expect(faultString(await parseResponse(out))).toBe(
            'Can\'t call "pleaseNotify" because there aren\'t enough parameters.'
        );
    });

    it('faults when there are too many params', async () => {
        const dispatcher = createXmlRpcDispatcher({ core: fakeCore() });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                '',
                '80',
                '/cb',
                'http-post',
                'http://feed.example/rss',
                'sub.example.com',
                'extra'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(faultString(await parseResponse(out))).toBe(
            'Can\'t call "pleaseNotify" because there are too many parameters.'
        );
    });

    it('faults on an unsupported protocol', async () => {
        const dispatcher = createXmlRpcDispatcher({ core: fakeCore() });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                '',
                '80',
                '/cb',
                'ftp',
                'http://feed.example/rss'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(faultString(await parseResponse(out))).toBe(
            'Can\'t accept the subscription because the protocol, <i>ftp</i>, is unsupported.'
        );
    });

    it('faults when subscribe throws an Error', async () => {
        const core = fakeCore({
            async subscribe() {
                throw new Error('subscribe boom');
            }
        });
        const dispatcher = createXmlRpcDispatcher({ core });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                '',
                '80',
                '/cb',
                'http-post',
                'http://feed.example/rss'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(faultString(await parseResponse(out))).toBe('subscribe boom');
    });

    it('faults when subscribe throws a non-Error value', async () => {
        const core = fakeCore({
            async subscribe() {
                throw 'plain string failure';
            }
        });
        const dispatcher = createXmlRpcDispatcher({ core });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.pleaseNotify', [
                '',
                '80',
                '/cb',
                'http-post',
                'http://feed.example/rss'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(faultString(await parseResponse(out))).toBe(
            'plain string failure'
        );
    });
});

describe('createXmlRpcDispatcher ping', () => {
    it('maps the resource url and returns success', async () => {
        const core = fakeCore();
        const dispatcher = createXmlRpcDispatcher({ core });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.ping', ['http://feed.example/rss']),
            { clientAddress: '203.0.113.5' }
        );

        expect(isSuccess(await parseResponse(out))).toBe(true);
        expect(core.pingCalls).toEqual([
            { resourceUrl: 'http://feed.example/rss' }
        ]);
    });

    it('returns success even when core.ping throws', async () => {
        const core = fakeCore({
            async ping() {
                throw new Error('ping boom');
            }
        });
        const dispatcher = createXmlRpcDispatcher({ core });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.ping', ['http://feed.example/rss']),
            { clientAddress: '203.0.113.5' }
        );

        expect(isSuccess(await parseResponse(out))).toBe(true);
    });

    it('faults when there are too few params', async () => {
        const dispatcher = createXmlRpcDispatcher({ core: fakeCore() });

        const out = await dispatcher.dispatch(methodCall('rssCloud.ping', []), {
            clientAddress: '203.0.113.5'
        });

        expect(faultString(await parseResponse(out))).toBe(
            'Can\'t call "ping" because there aren\'t enough parameters.'
        );
    });

    it('faults when there are too many params', async () => {
        const dispatcher = createXmlRpcDispatcher({ core: fakeCore() });

        const out = await dispatcher.dispatch(
            methodCall('rssCloud.ping', [
                'http://feed.example/rss',
                'http://extra.example/rss'
            ]),
            { clientAddress: '203.0.113.5' }
        );

        expect(faultString(await parseResponse(out))).toBe(
            'Can\'t call "ping" because there are too many parameters.'
        );
    });
});
