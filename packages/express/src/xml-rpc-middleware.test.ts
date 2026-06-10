import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import type {
    PingRequest,
    RssCloudCore,
    SubscribeRequest
} from '@rsscloud/core';
import { rpc2 } from './xml-rpc-middleware.js';

interface FakeCore {
    core: Pick<RssCloudCore, 'subscribe' | 'ping'>;
    pingCalls: PingRequest[];
    subscribeCalls: SubscribeRequest[];
}

function fakeCore(): FakeCore {
    const pingCalls: PingRequest[] = [];
    const subscribeCalls: SubscribeRequest[] = [];
    const core: Pick<RssCloudCore, 'subscribe' | 'ping'> = {
        async ping(req) {
            pingCalls.push(req);
            return { success: true, message: 'Thanks for the ping.' };
        },
        async subscribe(req) {
            subscribeCalls.push(req);
            return { success: true, message: 'ok' };
        }
    };
    return { core, pingCalls, subscribeCalls };
}

const pingCall =
    '<?xml version="1.0"?>' +
    '<methodCall><methodName>rssCloud.ping</methodName><params>' +
    '<param><value><string>http://feed.example/rss</string></value></param>' +
    '</params></methodCall>';

const pleaseNotifyCall =
    '<?xml version="1.0"?>' +
    '<methodCall><methodName>rssCloud.pleaseNotify</methodName><params>' +
    '<param><value><string>notify</string></value></param>' +
    '<param><value><string>5337</string></value></param>' +
    '<param><value><string>/notify</string></value></param>' +
    '<param><value><string>http-post</string></value></param>' +
    '<param><value><string>http://feed.example/rss</string></value></param>' +
    '</params></methodCall>';

describe('rpc2 middleware', () => {
    it('dispatches a methodCall and renders the methodResponse as text/xml', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/RPC2', rpc2({ core: fake.core }));

        const res = await request(app)
            .post('/RPC2')
            .set('Content-Type', 'text/xml')
            .send(pingCall);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/xml');
        expect(res.text).toContain('<methodResponse>');
        expect(res.text).toContain('<boolean>1</boolean>');
        expect(fake.pingCalls).toEqual([
            { resourceUrl: 'http://feed.example/rss' }
        ]);
    });

    it('passes the resolved client address into the dispatch context', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/RPC2', rpc2({ core: fake.core }));

        const res = await request(app)
            .post('/RPC2')
            .set('Content-Type', 'text/xml')
            .set('X-Forwarded-For', '203.0.113.5')
            .send(pleaseNotifyCall);

        expect(res.status).toBe(200);
        expect(fake.subscribeCalls).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'http://203.0.113.5:5337/notify',
                protocol: 'http-post',
                diffDomain: false
            }
        ]);
    });

    it('responds 406 when the caller does not accept xml', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/RPC2', rpc2({ core: fake.core }));

        const res = await request(app)
            .post('/RPC2')
            .set('Content-Type', 'text/xml')
            .set('Accept', 'application/json')
            .send(pingCall);

        expect(res.status).toBe(406);
        expect(res.text).toBe('Not Acceptable');
        expect(fake.pingCalls).toEqual([]);
    });

    it('dispatches an empty document when the body is not xml', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/RPC2', rpc2({ core: fake.core }));

        const res = await request(app)
            .post('/RPC2')
            .set('Content-Type', 'text/plain')
            .send(pingCall);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/xml');
        expect(res.text).toContain('faultString');
        expect(fake.pingCalls).toEqual([]);
    });
});
