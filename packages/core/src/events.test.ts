import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './events.js';

describe('createEventBus', () => {
    it('delivers an emitted payload to a registered listener', () => {
        const bus = createEventBus();
        const listener = vi.fn();

        bus.on('ping', listener);
        bus.emit('ping', {
            resourceUrl: 'https://feed.example/rss',
            changed: true,
            hash: 'abc',
            size: 10,
            durationMs: 5
        });

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0]?.[0]).toMatchObject({ changed: true });
    });

    it('stops delivery after the returned unsubscribe is called', () => {
        const bus = createEventBus();
        const listener = vi.fn();

        const off = bus.on('notify', listener);
        off();
        bus.emit('notify', {
            callbackUrl: 'https://sub.example/notify',
            protocol: 'http-post',
            resourceUrl: 'https://feed.example/rss'
        });

        expect(listener).not.toHaveBeenCalled();
    });

    it('fans an event out to every registered listener', () => {
        const bus = createEventBus();
        const first = vi.fn();
        const second = vi.fn();

        bus.on('ping', first);
        bus.on('ping', second);
        bus.emit('ping', {
            resourceUrl: 'https://feed.example/rss',
            changed: false,
            hash: 'abc',
            size: 10,
            durationMs: 5
        });

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('ignores emits for events with no listeners', () => {
        const bus = createEventBus();
        expect(() =>
            bus.emit('error', { scope: 'test', error: new Error('x') })
        ).not.toThrow();
    });
});
