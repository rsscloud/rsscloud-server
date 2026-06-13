import { describe, expect, it } from 'vitest';
import { parseMethodCall } from '@rsscloud/xml-rpc';
import { buildPingCall, buildPleaseNotifyCall } from './rpc-calls.js';

describe('buildPingCall', () => {
    it('builds a rssCloud.ping methodCall carrying the feed URL', async () => {
        const call = await parseMethodCall(
            buildPingCall('https://feed.example/rss')
        );

        expect(call.methodName).toBe('rssCloud.ping');
        expect(call.params).toEqual(['https://feed.example/rss']);
    });
});

describe('buildPleaseNotifyCall', () => {
    it('builds the six pleaseNotify params in wire order', async () => {
        const call = await parseMethodCall(
            buildPleaseNotifyCall({
                notifyProcedure: 'rssCloud.notify',
                port: 9000,
                path: '/RPC2',
                protocol: 'xml-rpc',
                urls: ['https://feed.example/rss'],
                domain: 'sub.example'
            })
        );

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

    it('carries an empty notifyProcedure and multiple urls', async () => {
        const call = await parseMethodCall(
            buildPleaseNotifyCall({
                notifyProcedure: '',
                port: 80,
                path: '/notify',
                protocol: 'http-post',
                urls: ['https://a.example/rss', 'https://b.example/rss'],
                domain: 'sub.example'
            })
        );

        expect(call.params).toEqual([
            '',
            80,
            '/notify',
            'http-post',
            ['https://a.example/rss', 'https://b.example/rss'],
            'sub.example'
        ]);
    });
});
