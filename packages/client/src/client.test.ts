import { describe, expect, it } from 'vitest';
import { parseMethodCall } from '@rsscloud/xml-rpc';
import { createRssCloudClient } from './client.js';

interface Captured {
    url: string;
    init: RequestInit;
}

function fakeFetch(status = 200, responseBody = 'OK') {
    const calls: Captured[] = [];
    const fn = (async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(responseBody, { status });
    }) as unknown as typeof fetch;
    return { fn, calls };
}

function header(init: RequestInit, name: string): string | undefined {
    return (init.headers as Record<string, string>)[name];
}

function form(init: RequestInit): URLSearchParams {
    return new URLSearchParams(init.body as string);
}

describe('createRssCloudClient ping', () => {
    it('pings over REST by default, posting the feed URL as a form', async () => {
        const { fn, calls } = fakeFetch();
        const client = createRssCloudClient({
            serverUrl: 'http://hub.example:5337',
            fetch: fn
        });

        const res = await client.ping({ feedUrl: 'https://feed.example/rss' });

        expect(calls[0]?.url).toBe('http://hub.example:5337/ping');
        expect(calls[0]?.init.method).toBe('POST');
        expect(header(calls[0]!.init, 'Content-Type')).toBe(
            'application/x-www-form-urlencoded'
        );
        expect(form(calls[0]!.init).get('url')).toBe(
            'https://feed.example/rss'
        );
        expect(res).toEqual({ status: 200, body: 'OK' });
    });

    it('pings over XML-RPC to /RPC2 when asked', async () => {
        const { fn, calls } = fakeFetch();
        const client = createRssCloudClient({
            serverUrl: 'http://hub.example:5337',
            fetch: fn
        });

        await client.ping({
            feedUrl: 'https://feed.example/rss',
            transport: 'xml-rpc'
        });

        expect(calls[0]?.url).toBe('http://hub.example:5337/RPC2');
        expect(header(calls[0]!.init, 'Content-Type')).toBe('text/xml');
        const call = await parseMethodCall(calls[0]?.init.body as string);
        expect(call.methodName).toBe('rssCloud.ping');
        expect(call.params).toEqual(['https://feed.example/rss']);
    });
});

describe('createRssCloudClient pleaseNotify', () => {
    it('registers an http-post callback over the REST front door', async () => {
        const { fn, calls } = fakeFetch();
        const client = createRssCloudClient({
            serverUrl: 'http://hub.example:5337',
            fetch: fn
        });

        await client.pleaseNotify({
            protocol: 'http-post',
            callback: { domain: 'sub.example', port: 9000, path: '/notify' },
            feedUrl: 'https://feed.example/rss'
        });

        expect(calls[0]?.url).toBe('http://hub.example:5337/pleaseNotify');
        expect(header(calls[0]!.init, 'Content-Type')).toBe(
            'application/x-www-form-urlencoded'
        );
        const body = form(calls[0]!.init);
        expect(body.get('port')).toBe('9000');
        expect(body.get('path')).toBe('/notify');
        expect(body.get('protocol')).toBe('http-post');
        expect(body.get('url1')).toBe('https://feed.example/rss');
    });

    it('registers an xml-rpc callback over /RPC2 with the six params', async () => {
        const { fn, calls } = fakeFetch();
        const client = createRssCloudClient({
            serverUrl: 'http://hub.example:5337',
            fetch: fn
        });

        await client.pleaseNotify({
            protocol: 'xml-rpc',
            callback: { domain: 'sub.example', port: 9000, path: '/RPC2' },
            feedUrl: 'https://feed.example/rss'
        });

        expect(calls[0]?.url).toBe('http://hub.example:5337/RPC2');
        expect(header(calls[0]!.init, 'Content-Type')).toBe('text/xml');
        const call = await parseMethodCall(calls[0]?.init.body as string);
        expect(call.methodName).toBe('rssCloud.pleaseNotify');
        expect(call.params).toEqual([
            'rssCloud.notify',
            9000,
            '/RPC2',
            'xml-rpc',
            ['https://feed.example/rss'],
            'sub.example'
        ]);
    });
});

describe('createRssCloudClient construction', () => {
    it('strips a trailing slash from the server URL', async () => {
        const { fn, calls } = fakeFetch();
        const client = createRssCloudClient({
            serverUrl: 'http://hub.example:5337/',
            fetch: fn
        });

        await client.ping({ feedUrl: 'https://feed.example/rss' });

        expect(calls[0]?.url).toBe('http://hub.example:5337/ping');
    });

    it('defaults to the global fetch when none is injected', () => {
        const client = createRssCloudClient({
            serverUrl: 'http://hub.example:5337'
        });

        expect(typeof client.ping).toBe('function');
        expect(typeof client.pleaseNotify).toBe('function');
    });
});
