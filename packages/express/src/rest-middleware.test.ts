import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import type {
    PingRequest,
    RssCloudCore,
    SubscribeRequest
} from '@rsscloud/core';
import { ping, pleaseNotify } from './rest-middleware.js';

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

describe('ping middleware', () => {
    it('renders a JSON success envelope and maps the url to a ping request', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/ping', ping({ core: fake.core }));

        const res = await request(app)
            .post('/ping')
            .type('form')
            .set('Accept', 'application/json')
            .send({ url: 'http://feed.example/rss' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.body).toEqual({
            success: true,
            msg: 'Thanks for the ping.'
        });
        expect(fake.pingCalls).toEqual([
            { resourceUrl: 'http://feed.example/rss' }
        ]);
    });

    it('renders an XML envelope when the caller accepts xml', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/ping', ping({ core: fake.core }));

        const res = await request(app)
            .post('/ping')
            .type('form')
            .set('Accept', 'application/xml')
            .send({ url: 'http://feed.example/rss' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/xml');
        expect(res.text).toContain('<result');
        expect(res.text).toContain('success="true"');
    });

    it('defaults to XML when the caller sends no Accept header', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/ping', ping({ core: fake.core }));

        const res = await request(app)
            .post('/ping')
            .type('form')
            .send({ url: 'http://feed.example/rss' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/xml');
    });

    it('responds 406 when the caller accepts neither xml nor json', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/ping', ping({ core: fake.core }));

        const res = await request(app)
            .post('/ping')
            .type('form')
            .set('Accept', 'text/plain')
            .send({ url: 'http://feed.example/rss' });

        expect(res.status).toBe(406);
        expect(res.text).toBe('Not Acceptable');
    });
});

describe('pleaseNotify middleware', () => {
    it('maps the body into a subscribe request using an explicit domain', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/pleaseNotify', pleaseNotify({ core: fake.core }));

        const res = await request(app)
            .post('/pleaseNotify')
            .type('form')
            .set('Accept', 'application/json')
            .send({
                url: 'http://feed.example/rss',
                port: '5337',
                path: '/notify',
                protocol: 'http-post',
                domain: 'example.com'
            });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.body.success).toBe(true);
        expect(fake.subscribeCalls).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'http://example.com:5337/notify',
                protocol: 'http-post',
                diffDomain: true
            }
        ]);
    });

    it('builds the callback host from X-Forwarded-For when no domain is given', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/pleaseNotify', pleaseNotify({ core: fake.core }));

        const res = await request(app)
            .post('/pleaseNotify')
            .type('form')
            .set('Accept', 'application/json')
            .set('X-Forwarded-For', '203.0.113.5')
            .send({
                url: 'http://feed.example/rss',
                port: '5337',
                path: '/notify',
                protocol: 'http-post'
            });

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

    it('renders a notifyResult XML envelope when the caller accepts xml', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/pleaseNotify', pleaseNotify({ core: fake.core }));

        const res = await request(app)
            .post('/pleaseNotify')
            .type('form')
            .set('Accept', 'application/xml')
            .send({
                url: 'http://feed.example/rss',
                port: '5337',
                path: '/notify',
                protocol: 'http-post',
                domain: 'example.com'
            });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/xml');
        expect(res.text).toContain('<notifyResult');
        expect(res.text).toContain('success="true"');
    });
});
