import { describe, expect, it } from 'vitest';
import { appMessages } from './app-messages.js';
import { buildSubscribeRequest } from './subscribe-request.js';

describe('buildSubscribeRequest', () => {
    it('builds a same-domain http-post request from the caller address', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '5337',
            path: '/feedupdated',
            protocol: 'http-post',
            clientAddress: '203.0.113.5'
        });

        expect(request).toEqual({
            resourceUrls: ['http://feed.example/rss'],
            callbackUrl: 'http://203.0.113.5:5337/feedupdated',
            protocol: 'http-post',
            diffDomain: false
        });
    });

    it('uses an explicit domain as the callback host and marks it diffDomain', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '5337',
            path: '/feedupdated',
            protocol: 'http-post',
            clientAddress: '203.0.113.5',
            domain: 'sub.example.com'
        });

        expect(request.callbackUrl).toBe('http://sub.example.com:5337/feedupdated');
        expect(request.diffDomain).toBe(true);
    });

    it('infers https from the https-post protocol', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '8080',
            path: '/cb',
            protocol: 'https-post',
            clientAddress: '203.0.113.5'
        });

        expect(request.callbackUrl).toBe('https://203.0.113.5:8080/cb');
    });

    it('infers https from port 443 even for http-post', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '443',
            path: '/cb',
            protocol: 'http-post',
            clientAddress: '203.0.113.5'
        });

        expect(request.callbackUrl).toBe('https://203.0.113.5:443/cb');
    });

    it('strips a ::ffff: prefix from an IPv4-mapped client address', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '8080',
            path: '/cb',
            protocol: 'http-post',
            clientAddress: '::ffff:198.51.100.7'
        });

        expect(request.callbackUrl).toBe('http://198.51.100.7:8080/cb');
    });

    it('brackets a bare IPv6 host', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '5337',
            path: '/cb',
            protocol: 'http-post',
            clientAddress: '203.0.113.5',
            domain: '::1'
        });

        expect(request.callbackUrl).toBe('http://[::1]:5337/cb');
    });

    it('adds a leading slash to a path that lacks one', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '8080',
            path: 'callback',
            protocol: 'http-post',
            clientAddress: '203.0.113.5'
        });

        expect(request.callbackUrl).toBe('http://203.0.113.5:8080/callback');
    });

    it('throws the unsupported-protocol message for a protocol outside the set', () => {
        expect(() =>
            buildSubscribeRequest({
                resourceUrls: ['http://feed.example/rss'],
                port: '80',
                path: '/cb',
                protocol: 'ftp',
                clientAddress: '203.0.113.5'
            })
        ).toThrow(appMessages.error.subscription.invalidProtocol('ftp'));
    });

    it('keeps a notifyProcedure for the xml-rpc protocol', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '5337',
            path: '/RPC2',
            protocol: 'xml-rpc',
            clientAddress: '203.0.113.5',
            notifyProcedure: 'river.feedUpdated'
        });

        expect(request.notifyProcedure).toBe('river.feedUpdated');
    });

    it('drops a notifyProcedure when the protocol is not xml-rpc', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '5337',
            path: '/cb',
            protocol: 'http-post',
            clientAddress: '203.0.113.5',
            notifyProcedure: 'river.feedUpdated'
        });

        expect(request.notifyProcedure).toBeUndefined();
    });

    it('omits a blank notifyProcedure even for xml-rpc', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '5337',
            path: '/RPC2',
            protocol: 'xml-rpc',
            clientAddress: '203.0.113.5',
            notifyProcedure: ''
        });

        expect(request.notifyProcedure).toBeUndefined();
    });

    it('treats an empty-string domain as absent — caller address, not diffDomain (ADR-0001)', () => {
        const request = buildSubscribeRequest({
            resourceUrls: ['http://feed.example/rss'],
            port: '5337',
            path: '/RPC2',
            protocol: 'xml-rpc',
            clientAddress: '203.0.113.5',
            domain: ''
        });

        expect(request.callbackUrl).toBe('http://203.0.113.5:5337/RPC2');
        expect(request.diffDomain).toBe(false);
    });
});
