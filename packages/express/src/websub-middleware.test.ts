import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import type {
    PingRequest,
    RssCloudCore,
    SubscribeRequest,
    UnsubscribeRequest
} from '@rsscloud/core';
import { websub } from './websub-middleware.js';

type WebSubCore = Pick<
    RssCloudCore,
    'acceptSubscription' | 'acceptUnsubscription' | 'acceptPublish'
>;

function fakeCore(): {
    core: WebSubCore;
    accepted: SubscribeRequest[];
    unsubscribed: UnsubscribeRequest[];
    published: PingRequest[];
} {
    const accepted: SubscribeRequest[] = [];
    const unsubscribed: UnsubscribeRequest[] = [];
    const published: PingRequest[] = [];
    const core: WebSubCore = {
        acceptSubscription(req) {
            accepted.push(req);
        },
        acceptUnsubscription(req) {
            unsubscribed.push(req);
        },
        acceptPublish(req) {
            published.push(req);
        }
    };
    return { core, accepted, unsubscribed, published };
}

describe('websub middleware', () => {
    it('accepts a valid subscribe with 202 and hands core the built request', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/websub', websub({ core: fake.core }));

        const res = await request(app)
            .post('/websub')
            .type('form')
            .send({
                'hub.mode': 'subscribe',
                'hub.callback': 'https://sub.example/listener',
                'hub.topic': 'http://feed.example/rss'
            });

        expect(res.status).toBe(202);
        expect(fake.accepted).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example/listener',
                protocol: 'websub'
            }
        ]);
    });

    it('accepts a valid unsubscribe with 202 and hands core the built request', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/websub', websub({ core: fake.core }));

        const res = await request(app)
            .post('/websub')
            .type('form')
            .send({
                'hub.mode': 'unsubscribe',
                'hub.callback': 'https://sub.example/listener',
                'hub.topic': 'http://feed.example/rss'
            });

        expect(res.status).toBe(202);
        expect(fake.unsubscribed).toEqual([
            {
                resourceUrls: ['http://feed.example/rss'],
                callbackUrl: 'https://sub.example/listener',
                protocol: 'websub'
            }
        ]);
        expect(fake.accepted).toEqual([]);
    });

    it('accepts a valid publish with 202 and hands core the topic', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/websub', websub({ core: fake.core }));

        const res = await request(app)
            .post('/websub')
            .type('form')
            .send({
                'hub.mode': 'publish',
                'hub.url': 'http://feed.example/rss'
            });

        expect(res.status).toBe(202);
        expect(fake.published).toEqual([
            { resourceUrl: 'http://feed.example/rss' }
        ]);
    });

    it('responds 400 to a malformed hub.* body without accepting anything', async () => {
        const fake = fakeCore();
        const app = express();
        app.post('/websub', websub({ core: fake.core }));

        const res = await request(app)
            .post('/websub')
            .type('form')
            .send({ 'hub.mode': 'subscribe' });

        expect(res.status).toBe(400);
        expect(fake.accepted).toEqual([]);
    });
});
