import { describe, expect, it } from 'vitest';
import { parseSubscribe } from './websub-dispatcher.js';

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
});
