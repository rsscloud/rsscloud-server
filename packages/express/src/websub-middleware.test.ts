import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { RssCloudCore, SubscribeRequest } from '@rsscloud/core';
import { websub } from './websub-middleware.js';

function fakeCore(): {
    core: Pick<RssCloudCore, 'acceptSubscription'>;
    accepted: SubscribeRequest[];
} {
    const accepted: SubscribeRequest[] = [];
    const core: Pick<RssCloudCore, 'acceptSubscription'> = {
        acceptSubscription(req) {
            accepted.push(req);
        }
    };
    return { core, accepted };
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
