const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventBus } = require('@rsscloud/core');
const bridgeCoreEvents = require('./core-event-bridge');

function fakeWebsocket() {
    const sent = [];
    return { sent, broadcast: message => sent.push(message) };
}

const fixedNow = () => new Date('2026-06-10T00:00:00.000Z');

test('broadcasts a ping event with timing from durationMs', () => {
    const events = createEventBus();
    const ws = fakeWebsocket();
    bridgeCoreEvents(events, ws, fixedNow);

    events.emit('ping', {
        resourceUrl: 'https://example.com/feed.xml',
        changed: true,
        hash: 'h',
        size: 10,
        durationMs: 1500
    });

    assert.deepStrictEqual(ws.sent, [
        {
            eventtype: 'ping',
            data: {
                resourceUrl: 'https://example.com/feed.xml',
                changed: true,
                hash: 'h',
                size: 10,
                durationMs: 1500
            },
            secs: 1.5,
            time: new Date('2026-06-10T00:00:00.000Z')
        }
    ]);
});

test('broadcasts an event without timing as secs 0', () => {
    const events = createEventBus();
    const ws = fakeWebsocket();
    bridgeCoreEvents(events, ws, fixedNow);

    events.emit('notify', {
        callbackUrl: 'https://aggregator.example/cb',
        protocol: 'https-post',
        resourceUrl: 'https://example.com/feed.xml'
    });

    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0].eventtype, 'notify');
    assert.equal(ws.sent[0].secs, 0);
});

test('flattens an error event to its scope and message', () => {
    const events = createEventBus();
    const ws = fakeWebsocket();
    bridgeCoreEvents(events, ws, fixedNow);

    events.emit('error', {
        scope: 'ping',
        error: new Error('boom')
    });

    assert.deepStrictEqual(ws.sent[0].data, { scope: 'ping', error: 'boom' });
});
