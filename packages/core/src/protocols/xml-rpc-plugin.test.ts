import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryContext, VerifyContext } from '../engine/plugin.js';
import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';
import { parseMethodCall } from '@rsscloud/xml-rpc';
import { createXmlRpcProtocolPlugin } from './xml-rpc-plugin.js';

const epoch = new Date(0);

function subscription(url: string, notifyProcedure?: string): Subscription {
    const sub: Subscription = {
        url,
        protocol: 'xml-rpc',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: epoch,
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: new Date('2099-01-01T00:00:00Z')
    };
    if (notifyProcedure !== undefined) {
        sub.notifyProcedure = notifyProcedure;
    }
    return sub;
}

function resource(url: string): Resource {
    return {
        url,
        lastHash: '',
        lastSize: 0,
        ctChecks: 0,
        whenLastCheck: epoch,
        ctUpdates: 0,
        whenLastUpdate: epoch
    };
}

function deliveryContext(
    callbackUrl: string,
    resourceUrl: string,
    notifyProcedure?: string
): DeliveryContext {
    return {
        subscription: subscription(callbackUrl, notifyProcedure),
        resource: resource(resourceUrl),
        payload: { body: '', contentType: null }
    };
}

function verifyContext(
    callbackUrl: string,
    resourceUrl: string,
    diffDomain: boolean,
    notifyProcedure?: string
): VerifyContext {
    return {
        subscription: subscription(callbackUrl, notifyProcedure),
        resourceUrl,
        diffDomain
    };
}

describe('createXmlRpcProtocolPlugin deliver', () => {
    it('POSTs a text/xml methodCall and reports ok on 2xx', async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response('', { status: 200 });
        }) as typeof fetch;

        const plugin = createXmlRpcProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/RPC2',
                'https://feed.example/rss',
                'myCloud.notify'
            )
        );

        expect(result).toEqual({ ok: true });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe('https://subscriber.example/RPC2');
        expect(calls[0]?.init.method).toBe('POST');
        const headers = calls[0]?.init.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('text/xml');

        const call = await parseMethodCall(calls[0]?.init.body as string);
        expect(call.methodName).toBe('myCloud.notify');
        expect(call.params).toEqual(['https://feed.example/rss']);
    });

    it('sends an empty methodName when the subscription has no notifyProcedure', async () => {
        let body = '';
        const fakeFetch = (async (_url: string | URL, init?: RequestInit) => {
            body = init?.body as string;
            return new Response('', { status: 200 });
        }) as typeof fetch;

        const plugin = createXmlRpcProtocolPlugin({ fetch: fakeFetch });

        await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/RPC2',
                'https://feed.example/rss'
            )
        );

        const call = await parseMethodCall(body);
        expect(call.methodName).toBe('');
        expect(call.params).toEqual(['https://feed.example/rss']);
    });

    it('reports failure when the callback responds non-2xx', async () => {
        const fakeFetch = (async () =>
            new Response('nope', { status: 500 })) as typeof fetch;

        const plugin = createXmlRpcProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/RPC2',
                'https://feed.example/rss',
                'myCloud.notify'
            )
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
    });

    it('reports failure when the request throws', async () => {
        const fakeFetch = (async () => {
            throw new Error('boom');
        }) as typeof fetch;

        const plugin = createXmlRpcProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/RPC2',
                'https://feed.example/rss',
                'myCloud.notify'
            )
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
    });
});

describe('createXmlRpcProtocolPlugin verify', () => {
    it('confirms with a plain test notify, ignoring diffDomain', async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response('', { status: 200 });
        }) as typeof fetch;

        const plugin = createXmlRpcProtocolPlugin({ fetch: fakeFetch });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://subscriber.example/RPC2',
                    'https://feed.example/rss',
                    true,
                    'myCloud.notify'
                )
            )
        ).resolves.toBeUndefined();

        expect(calls).toHaveLength(1);
        expect(calls[0]?.init.method).toBe('POST');
        const call = await parseMethodCall(calls[0]?.init.body as string);
        expect(call.methodName).toBe('myCloud.notify');
        expect(call.params).toEqual(['https://feed.example/rss']);
    });

    it('rejects when the test notify fails', async () => {
        const fakeFetch = (async () =>
            new Response('', { status: 500 })) as typeof fetch;

        const plugin = createXmlRpcProtocolPlugin({ fetch: fakeFetch });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://subscriber.example/RPC2',
                    'https://feed.example/rss',
                    false
                )
            )
        ).rejects.toThrow();
    });
});

describe('createXmlRpcProtocolPlugin protocols', () => {
    it('owns the xml-rpc protocol value', () => {
        const plugin = createXmlRpcProtocolPlugin();
        expect(plugin.protocols).toEqual(['xml-rpc']);
    });
});

afterEach(() => {
    vi.useRealTimers();
});
