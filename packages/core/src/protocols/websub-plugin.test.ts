import { describe, expect, it } from 'vitest';
import type { DeliveryContext, VerifyContext } from '../engine/plugin.js';
import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';
import { createWebSubProtocolPlugin } from './websub-plugin.js';

const epoch = new Date(0);

function subscription(url: string): Subscription {
    return {
        url,
        protocol: 'websub',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: epoch,
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: new Date('2099-01-01T00:00:00Z')
    };
}

function verifyContext(
    callbackUrl: string,
    resourceUrl: string,
    diffDomain: boolean
): VerifyContext {
    return {
        subscription: subscription(callbackUrl),
        resourceUrl,
        diffDomain
    };
}

function resource(url: string): Resource {
    return {
        url,
        lastHash: '',
        lastSize: 0,
        ctChecks: 0,
        whenLastCheck: epoch,
        ctUpdates: 0,
        whenLastUpdate: epoch
    };
}

function deliveryContext(
    callbackUrl: string,
    resourceUrl: string
): DeliveryContext {
    return {
        subscription: subscription(callbackUrl),
        resource: resource(resourceUrl),
        payload: { body: '', contentType: null }
    };
}

describe('createWebSubProtocolPlugin verify', () => {
    it('GETs the callback with hub.mode/topic/challenge and resolves on an exact 2xx echo', async () => {
        const calls: string[] = [];
        const fakeFetch = (async (url: string | URL) => {
            calls.push(String(url));
            const challenge = new URL(String(url)).searchParams.get(
                'hub.challenge'
            );
            return new Response(challenge, { status: 200 });
        }) as typeof fetch;

        const plugin = createWebSubProtocolPlugin({
            fetch: fakeFetch,
            createChallenge: () => 'chal-123'
        });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://sub.example/listener',
                    'http://feed.example/rss',
                    true
                )
            )
        ).resolves.toBeUndefined();

        const url = new URL(calls[0] as string);
        expect(url.origin + url.pathname).toBe('https://sub.example/listener');
        expect(url.searchParams.get('hub.mode')).toBe('subscribe');
        expect(url.searchParams.get('hub.topic')).toBe(
            'http://feed.example/rss'
        );
        expect(url.searchParams.get('hub.challenge')).toBe('chal-123');
    });

    it('rejects when the 2xx response does not echo the exact challenge', async () => {
        const fakeFetch = (async () =>
            new Response('not-the-challenge', { status: 200 })) as typeof fetch;

        const plugin = createWebSubProtocolPlugin({
            fetch: fakeFetch,
            createChallenge: () => 'chal-123'
        });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://sub.example/listener',
                    'http://feed.example/rss',
                    true
                )
            )
        ).rejects.toThrow();
    });

    it('rejects when the challenge response is non-2xx even if it echoes', async () => {
        const fakeFetch = (async (url: string | URL) => {
            const challenge = new URL(String(url)).searchParams.get(
                'hub.challenge'
            );
            return new Response(challenge, { status: 404 });
        }) as typeof fetch;

        const plugin = createWebSubProtocolPlugin({
            fetch: fakeFetch,
            createChallenge: () => 'chal-123'
        });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://sub.example/listener',
                    'http://feed.example/rss',
                    true
                )
            )
        ).rejects.toThrow();
    });

    it('always verifies via the challenge GET, ignoring diffDomain=false', async () => {
        const calls: { url: string; method: string | undefined }[] = [];
        const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
            calls.push({ url: String(url), method: init?.method });
            const challenge = new URL(String(url)).searchParams.get(
                'hub.challenge'
            );
            return new Response(challenge, { status: 200 });
        }) as typeof fetch;

        const plugin = createWebSubProtocolPlugin({
            fetch: fakeFetch,
            createChallenge: () => 'chal-123'
        });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://sub.example/listener',
                    'http://feed.example/rss',
                    false
                )
            )
        ).resolves.toBeUndefined();

        expect(calls).toHaveLength(1);
        expect(calls[0]?.method).toBe('GET');
        expect(
            new URL(calls[0]?.url as string).searchParams.get('hub.challenge')
        ).toBe('chal-123');
    });

    it('preserves existing query params on the callback when appending hub.*', async () => {
        const calls: string[] = [];
        const fakeFetch = (async (url: string | URL) => {
            calls.push(String(url));
            const challenge = new URL(String(url)).searchParams.get(
                'hub.challenge'
            );
            return new Response(challenge, { status: 200 });
        }) as typeof fetch;

        const plugin = createWebSubProtocolPlugin({
            fetch: fakeFetch,
            createChallenge: () => 'chal-123'
        });

        await plugin.verify(
            verifyContext(
                'https://sub.example/listener?id=42',
                'http://feed.example/rss',
                true
            )
        );

        const url = new URL(calls[0] as string);
        expect(url.searchParams.get('id')).toBe('42');
        expect(url.searchParams.get('hub.mode')).toBe('subscribe');
    });

    it('generates its own challenge token when none is injected', async () => {
        let sentChallenge: string | null = null;
        const fakeFetch = (async (url: string | URL) => {
            sentChallenge = new URL(String(url)).searchParams.get(
                'hub.challenge'
            );
            return new Response(sentChallenge, { status: 200 });
        }) as typeof fetch;

        const plugin = createWebSubProtocolPlugin({ fetch: fakeFetch });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://sub.example/listener',
                    'http://feed.example/rss',
                    true
                )
            )
        ).resolves.toBeUndefined();

        expect(sentChallenge).toMatch(/^[0-9a-f]+$/);
    });
});

describe('createWebSubProtocolPlugin protocols', () => {
    it('owns the websub protocol value', () => {
        const plugin = createWebSubProtocolPlugin();
        expect(plugin.protocols).toEqual(['websub']);
    });
});

describe('createWebSubProtocolPlugin deliver', () => {
    it('reports failure since content distribution is not implemented yet (S2.1)', async () => {
        const plugin = createWebSubProtocolPlugin();

        const result = await plugin.deliver(
            deliveryContext(
                'https://sub.example/listener',
                'http://feed.example/rss'
            )
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
    });
});
