import { describe, expect, it } from 'vitest';
import type { SubscribeRequest } from '../engine/dto.js';
import { createWebSubDispatcher, parseSubscribe } from './websub-dispatcher.js';

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
});

describe('createWebSubDispatcher', () => {
    function fakeCore(): {
        calls: SubscribeRequest[];
        acceptSubscription: (req: SubscribeRequest) => void;
    } {
        const calls: SubscribeRequest[] = [];
        return { calls, acceptSubscription: req => void calls.push(req) };
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
});
