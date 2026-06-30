import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryContext, VerifyContext } from '../engine/plugin.js';
import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';
import { createRestProtocolPlugin } from './rest-plugin.js';

const epoch = new Date(0);

function subscription(url: string): Subscription {
    return {
        url,
        protocol: 'http-post',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: epoch,
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: new Date('2099-01-01T00:00:00Z')
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

describe('createRestProtocolPlugin deliver', () => {
    it('POSTs the resource url form-encoded and reports ok on 2xx', async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response('', { status: 200 });
        }) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/notify',
                'https://feed.example/rss'
            )
        );

        expect(result).toEqual({ ok: true });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe('https://subscriber.example/notify');
        expect(calls[0]?.init.method).toBe('POST');
        const body = calls[0]?.init.body as URLSearchParams;
        expect(body.get('url')).toBe('https://feed.example/rss');
    });

    it('reports failure when the callback responds non-2xx', async () => {
        const fakeFetch = (async () =>
            new Response('nope', { status: 500 })) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/notify',
                'https://feed.example/rss'
            )
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
    });

    it('follows a 3xx redirect by re-POSTing to the resolved Location', async () => {
        const calls: string[] = [];
        const fakeFetch = (async (url: string | URL) => {
            calls.push(String(url));
            if (calls.length === 1) {
                return new Response('', {
                    status: 302,
                    headers: { location: '/moved' }
                });
            }
            return new Response('', { status: 200 });
        }) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/notify',
                'https://feed.example/rss'
            )
        );

        expect(result).toEqual({ ok: true });
        expect(calls).toEqual([
            'https://subscriber.example/notify',
            'https://subscriber.example/moved'
        ]);
    });

    it('reports failure when a callback redirects past the hop limit', async () => {
        let calls = 0;
        const fakeFetch = (async () => {
            calls += 1;
            return new Response('', {
                status: 302,
                headers: { location: '/loop' }
            });
        }) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/loop',
                'https://feed.example/rss'
            )
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
        // Bounded: the initial POST plus a fixed number of redirect hops, not ∞.
        expect(calls).toBe(6);
    });

    it('treats a 3xx without a Location header as a failure', async () => {
        const fakeFetch = (async () =>
            new Response('', { status: 302 })) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/notify',
                'https://feed.example/rss'
            )
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
    });

    it('reports failure when the request throws', async () => {
        const fakeFetch = (async () => {
            throw new Error('boom');
        }) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        const result = await plugin.deliver(
            deliveryContext(
                'https://subscriber.example/notify',
                'https://feed.example/rss'
            )
        );

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
    });

    it('aborts and fails when the callback exceeds the timeout', async () => {
        vi.useFakeTimers();
        let abortedWith: unknown;
        const fakeFetch = ((_url: string | URL, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    abortedWith = init.signal?.reason;
                    reject(
                        Object.assign(new Error('aborted'), {
                            name: 'AbortError'
                        })
                    );
                });
            })) as typeof fetch;

        const plugin = createRestProtocolPlugin({
            fetch: fakeFetch,
            requestTimeoutMs: 50
        });

        const promise = plugin.deliver(
            deliveryContext(
                'https://subscriber.example/notify',
                'https://feed.example/rss'
            )
        );

        await vi.advanceTimersByTimeAsync(50);
        const result = await promise;

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
        expect(abortedWith).toBeDefined();
    });
});

describe('createRestProtocolPlugin verify', () => {
    it('passes the cross-domain challenge handshake', async () => {
        const calls: string[] = [];
        const fakeFetch = (async (url: string | URL) => {
            calls.push(String(url));
            const challenge = new URL(String(url)).searchParams.get('challenge');
            return new Response(challenge, { status: 200 });
        }) as typeof fetch;

        const plugin = createRestProtocolPlugin({
            fetch: fakeFetch,
            createChallenge: () => 'abc123'
        });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://subscriber.example/notify',
                    'https://feed.example/rss',
                    true
                )
            )
        ).resolves.toBeUndefined();

        const url = new URL(calls[0] as string);
        expect(url.origin + url.pathname).toBe(
            'https://subscriber.example/notify'
        );
        expect(url.searchParams.get('url')).toBe('https://feed.example/rss');
        expect(url.searchParams.get('challenge')).toBe('abc123');
    });

    it('rejects when the challenge response does not echo the token', async () => {
        const fakeFetch = (async () =>
            new Response('mismatch', { status: 200 })) as typeof fetch;

        const plugin = createRestProtocolPlugin({
            fetch: fakeFetch,
            createChallenge: () => 'abc123'
        });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://subscriber.example/notify',
                    'https://feed.example/rss',
                    true
                )
            )
        ).rejects.toThrow();
    });

    it('rejects when the challenge response is non-2xx', async () => {
        const fakeFetch = (async (url: string | URL) => {
            const challenge = new URL(String(url)).searchParams.get('challenge');
            return new Response(challenge, { status: 404 });
        }) as typeof fetch;

        const plugin = createRestProtocolPlugin({
            fetch: fakeFetch,
            createChallenge: () => 'abc123'
        });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://subscriber.example/notify',
                    'https://feed.example/rss',
                    true
                )
            )
        ).rejects.toThrow();
    });

    it('confirms a same-domain subscription with a test notification', async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response('', { status: 200 });
        }) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://subscriber.example/notify',
                    'https://feed.example/rss',
                    false
                )
            )
        ).resolves.toBeUndefined();

        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe('https://subscriber.example/notify');
        expect(calls[0]?.init.method).toBe('POST');
        const body = calls[0]?.init.body as URLSearchParams;
        expect(body.get('url')).toBe('https://feed.example/rss');
    });

    it('rejects a same-domain subscription when the test notify fails', async () => {
        const fakeFetch = (async () =>
            new Response('', { status: 500 })) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://subscriber.example/notify',
                    'https://feed.example/rss',
                    false
                )
            )
        ).rejects.toThrow();
    });

    it('generates its own challenge token when none is injected', async () => {
        let sentChallenge: string | null = null;
        const fakeFetch = (async (url: string | URL) => {
            sentChallenge = new URL(String(url)).searchParams.get('challenge');
            return new Response(sentChallenge, { status: 200 });
        }) as typeof fetch;

        const plugin = createRestProtocolPlugin({ fetch: fakeFetch });

        await expect(
            plugin.verify(
                verifyContext(
                    'https://subscriber.example/notify',
                    'https://feed.example/rss',
                    true
                )
            )
        ).resolves.toBeUndefined();

        expect(sentChallenge).toMatch(/^[0-9a-f]+$/);
    });
});

describe('createRestProtocolPlugin protocols', () => {
    it('owns the rssCloud REST protocol values', () => {
        const plugin = createRestProtocolPlugin();
        expect(plugin.protocols).toEqual(['http-post', 'https-post']);
    });
});

afterEach(() => {
    vi.useRealTimers();
});
