import { describe, expect, it } from 'vitest';
import {
    resourceFromJson,
    resourceToJson,
    subscriptionFromJson,
    subscriptionToJson
} from './store-codec.js';
import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';

describe('resource codec', () => {
    it('serializes a resource with feed metadata to ISO dates and nested feed', () => {
        const resource: Resource = {
            url: 'https://feed.example/rss',
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 5,
            whenLastCheck: new Date('2026-01-02T03:04:05.000Z'),
            ctUpdates: 2,
            whenLastUpdate: new Date('2026-01-03T04:05:06.000Z'),
            feed: { type: 'rss', title: 'New', language: 'en' }
        };

        expect(resourceToJson(resource)).toEqual({
            url: 'https://feed.example/rss',
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 5,
            whenLastCheck: '2026-01-02T03:04:05.000Z',
            ctUpdates: 2,
            whenLastUpdate: '2026-01-03T04:05:06.000Z',
            feed: { type: 'rss', title: 'New', language: 'en' }
        });
    });

    it('omits feed when the resource has none', () => {
        const resource: Resource = {
            url: 'https://feed.example/rss',
            lastHash: '',
            lastSize: 0,
            ctChecks: 0,
            whenLastCheck: new Date(0),
            ctUpdates: 0,
            whenLastUpdate: new Date(0)
        };

        const json = resourceToJson(resource);
        expect('feed' in json).toBe(false);
        expect(resourceFromJson(json)).toEqual(resource);
    });

    it('round-trips a resource through to/from JSON', () => {
        const resource: Resource = {
            url: 'https://feed.example/rss',
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 5,
            whenLastCheck: new Date('2026-01-02T03:04:05.000Z'),
            ctUpdates: 2,
            whenLastUpdate: new Date('2026-01-03T04:05:06.000Z'),
            feed: { type: 'atom', title: 'A' }
        };

        expect(resourceFromJson(resourceToJson(resource))).toEqual(resource);
    });
});

describe('subscription codec', () => {
    it('serializes a full subscription, preserving null "never" dates', () => {
        const subscription: Subscription = {
            url: 'http://sub.example/rpc',
            protocol: 'xml-rpc',
            notifyProcedure: 'river.feedUpdated',
            ctUpdates: 3,
            ctErrors: 1,
            ctConsecutiveErrors: 0,
            whenCreated: new Date('2026-01-01T00:00:00.000Z'),
            whenLastUpdate: new Date('2026-02-01T00:00:00.000Z'),
            whenLastError: new Date('2025-12-01T00:00:00.000Z'),
            whenExpires: new Date('2099-01-01T00:00:00.000Z'),
            details: { secret: 's3cr3t' }
        };

        expect(subscriptionToJson(subscription)).toEqual({
            url: 'http://sub.example/rpc',
            protocol: 'xml-rpc',
            notifyProcedure: 'river.feedUpdated',
            ctUpdates: 3,
            ctErrors: 1,
            ctConsecutiveErrors: 0,
            whenCreated: '2026-01-01T00:00:00.000Z',
            whenLastUpdate: '2026-02-01T00:00:00.000Z',
            whenLastError: '2025-12-01T00:00:00.000Z',
            whenExpires: '2099-01-01T00:00:00.000Z',
            details: { secret: 's3cr3t' }
        });
    });

    it('keeps null for whenLastUpdate/whenLastError and omits optional fields', () => {
        const subscription: Subscription = {
            url: 'http://sub.example/notify',
            protocol: 'http-post',
            ctUpdates: 0,
            ctErrors: 0,
            ctConsecutiveErrors: 0,
            whenCreated: new Date('2026-01-01T00:00:00.000Z'),
            whenLastUpdate: null,
            whenLastError: null,
            whenExpires: new Date('2099-01-01T00:00:00.000Z')
        };

        const json = subscriptionToJson(subscription);
        expect(json.whenLastUpdate).toBeNull();
        expect(json.whenLastError).toBeNull();
        expect('notifyProcedure' in json).toBe(false);
        expect('details' in json).toBe(false);
        expect(subscriptionFromJson(json)).toEqual(subscription);
    });

    it('round-trips a full subscription through to/from JSON', () => {
        const subscription: Subscription = {
            url: 'http://sub.example/rpc',
            protocol: 'xml-rpc',
            notifyProcedure: 'river.feedUpdated',
            ctUpdates: 3,
            ctErrors: 1,
            ctConsecutiveErrors: 0,
            whenCreated: new Date('2026-01-01T00:00:00.000Z'),
            whenLastUpdate: new Date('2026-02-01T00:00:00.000Z'),
            whenLastError: new Date('2025-12-01T00:00:00.000Z'),
            whenExpires: new Date('2099-01-01T00:00:00.000Z'),
            details: { secret: 's3cr3t' }
        };

        expect(subscriptionFromJson(subscriptionToJson(subscription))).toEqual(
            subscription
        );
    });
});
