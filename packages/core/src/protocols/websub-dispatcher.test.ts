import { describe, expect, it } from 'vitest';
import type { SubscribeRequest, UnsubscribeRequest } from '../engine/dto.js';
import {
    createWebSubDispatcher,
    parseSubscribe,
    parseUnsubscribe
} from './websub-dispatcher.js';

describe('parseSubscribe', () => {
    it('builds a websub SubscribeRequest directly from hub.callback and hub.topic', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({
            ok: true,
            request: {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example.com/listener',
                protocol: 'websub'
            }
        });
    });

    it('rejects a body with no hub.mode as a 400', () => {
        const result = parseSubscribe({
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({ ok: false, status: 400 });
    });

    it('rejects a missing hub.callback as a 400', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({ ok: false, status: 400 });
    });

    it('rejects a hub.callback that is not a valid absolute URL as a 400', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'not a url',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({ ok: false, status: 400 });
    });

    it('rejects a missing hub.topic as a 400', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example.com/listener'
        });

        expect(result).toEqual({ ok: false, status: 400 });
    });

    it('rejects an empty hub.topic as a 400', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': ''
        });

        expect(result).toEqual({ ok: false, status: 400 });
    });

    it('carries a supplied hub.secret through as details.secret', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': 'http://feed.example/rss',
            'hub.secret': 's3cr3t'
        });

        expect(result).toEqual({
            ok: true,
            request: {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example.com/listener',
                protocol: 'websub',
                details: { secret: 's3cr3t' }
            }
        });
    });

    it('parses hub.lease_seconds into details.leaseSeconds', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': 'http://feed.example/rss',
            'hub.lease_seconds': '600'
        });

        expect(result).toEqual({
            ok: true,
            request: {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example.com/listener',
                protocol: 'websub',
                details: { leaseSeconds: 600 }
            }
        });
    });

    it('carries both hub.secret and hub.lease_seconds in details', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': 'http://feed.example/rss',
            'hub.secret': 's3cr3t',
            'hub.lease_seconds': '3600'
        });

        expect(result).toEqual({
            ok: true,
            request: {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example.com/listener',
                protocol: 'websub',
                details: { secret: 's3cr3t', leaseSeconds: 3600 }
            }
        });
    });

    it('ignores a non-numeric hub.lease_seconds', () => {
        const result = parseSubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': 'http://feed.example/rss',
            'hub.lease_seconds': 'soon'
        });

        expect(result).toEqual({
            ok: true,
            request: {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example.com/listener',
                protocol: 'websub'
            }
        });
    });
});

describe('parseUnsubscribe', () => {
    it('builds a websub UnsubscribeRequest directly from hub.callback and hub.topic', () => {
        const result = parseUnsubscribe({
            'hub.mode': 'unsubscribe',
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({
            ok: true,
            request: {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example.com/listener',
                protocol: 'websub'
            }
        });
    });

    it('rejects a body whose mode is not unsubscribe as a 400', () => {
        const result = parseUnsubscribe({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example.com/listener',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({ ok: false, status: 400 });
    });

    it('rejects a missing hub.topic as a 400', () => {
        const result = parseUnsubscribe({
            'hub.mode': 'unsubscribe',
            'hub.callback': 'https://sub.example.com/listener'
        });

        expect(result).toEqual({ ok: false, status: 400 });
    });
});

describe('createWebSubDispatcher', () => {
    function fakeCore(): {
        calls: SubscribeRequest[];
        unsubscribeCalls: UnsubscribeRequest[];
        acceptSubscription: (req: SubscribeRequest) => void;
        acceptUnsubscription: (req: UnsubscribeRequest) => void;
    } {
        const calls: SubscribeRequest[] = [];
        const unsubscribeCalls: UnsubscribeRequest[] = [];
        return {
            calls,
            unsubscribeCalls,
            acceptSubscription: req => void calls.push(req),
            acceptUnsubscription: req => void unsubscribeCalls.push(req)
        };
    }

    it('accepts a valid subscribe with 202 and hands core the built request', () => {
        const core = fakeCore();
        const dispatcher = createWebSubDispatcher({ core });

        const result = dispatcher.dispatch({
            'hub.mode': 'subscribe',
            'hub.callback': 'https://sub.example/listener',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({ status: 202 });
        expect(core.calls).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example/listener',
                protocol: 'websub'
            }
        ]);
    });

    it('returns 400 for a malformed request without accepting anything', () => {
        const core = fakeCore();
        const dispatcher = createWebSubDispatcher({ core });

        const result = dispatcher.dispatch({ 'hub.mode': 'subscribe' });

        expect(result).toEqual({ status: 400 });
        expect(core.calls).toEqual([]);
    });

    it('accepts a valid unsubscribe with 202 and hands core the built request', () => {
        const core = fakeCore();
        const dispatcher = createWebSubDispatcher({ core });

        const result = dispatcher.dispatch({
            'hub.mode': 'unsubscribe',
            'hub.callback': 'https://sub.example/listener',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({ status: 202 });
        expect(core.unsubscribeCalls).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example/listener',
                protocol: 'websub'
            }
        ]);
        expect(core.calls).toEqual([]);
    });

    it('returns 400 for a malformed unsubscribe without accepting anything', () => {
        const core = fakeCore();
        const dispatcher = createWebSubDispatcher({ core });

        const result = dispatcher.dispatch({ 'hub.mode': 'unsubscribe' });

        expect(result).toEqual({ status: 400 });
        expect(core.unsubscribeCalls).toEqual([]);
    });

    it('returns 400 for an unsupported hub.mode without accepting anything', () => {
        const core = fakeCore();
        const dispatcher = createWebSubDispatcher({ core });

        const result = dispatcher.dispatch({
            'hub.mode': 'publish',
            'hub.callback': 'https://sub.example/listener',
            'hub.topic': 'http://feed.example/rss'
        });

        expect(result).toEqual({ status: 400 });
        expect(core.calls).toEqual([]);
        expect(core.unsubscribeCalls).toEqual([]);
    });
});
