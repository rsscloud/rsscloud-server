import type {
    DeliveryContext,
    DeliveryResult,
    ProtocolPlugin,
    VerifyContext
} from './plugin.js';
import type { Protocol } from './protocol.js';

/** Construction-time dependencies for the rssCloud REST protocol plugin. */
export interface RestProtocolPluginOptions {
    /** Injectable fetch (tests, edge runtimes); defaults to global fetch. */
    fetch?: typeof fetch;
    /** Per-request timeout (ms) for outbound calls. */
    requestTimeoutMs?: number;
    /** Challenge generator for the cross-domain handshake (injectable for tests). */
    createChallenge?: () => string;
}

const REST_PROTOCOLS: Protocol[] = ['http-post', 'https-post'];

/** Fallback request timeout when none is supplied (mirrors the server default). */
const DEFAULT_REQUEST_TIMEOUT_MS = 4000;

/** Portable, hard-to-guess token for the cross-domain challenge handshake. */
function defaultCreateChallenge(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(
        ''
    );
}

/**
 * The rssCloud REST delivery protocol (`http-post` / `https-post`). Subscribers
 * are notified with a form-encoded POST carrying the changed resource URL;
 * cross-domain subscriptions are confirmed with a challenge GET handshake.
 */
export function createRestProtocolPlugin(
    options: RestProtocolPluginOptions = {}
): ProtocolPlugin {
    const doFetch = options.fetch ?? fetch;
    const requestTimeoutMs =
        options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const createChallenge = options.createChallenge ?? defaultCreateChallenge;

    function notifyBody(resourceUrl: string): URLSearchParams {
        const body = new URLSearchParams();
        body.append('url', resourceUrl);
        return body;
    }

    /** Fetch with the configured timeout enforced via an abort signal. */
    async function fetchWithTimeout(
        url: string,
        init: RequestInit
    ): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            requestTimeoutMs
        );

        try {
            return await doFetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }
    }

    /** POST the notification, following redirects; throws on timeout or non-2xx. */
    async function sendNotify(
        targetUrl: string,
        body: URLSearchParams
    ): Promise<void> {
        const res = await fetchWithTimeout(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            redirect: 'manual'
        });

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (location) {
                await sendNotify(
                    new URL(location, targetUrl).toString(),
                    body
                );
                return;
            }
        }

        if (!res.ok) {
            throw new Error('Notification Failed');
        }
    }

    async function deliver(ctx: DeliveryContext): Promise<DeliveryResult> {
        try {
            await sendNotify(ctx.subscription.url, notifyBody(ctx.resource.url));
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err as Error };
        }
    }

    async function verifyChallenge(
        apiurl: string,
        resourceUrl: string
    ): Promise<void> {
        const challenge = createChallenge();
        const query = new URLSearchParams({ url: resourceUrl, challenge });
        const testUrl = apiurl + '?' + query.toString();

        const res = await fetchWithTimeout(testUrl, { method: 'GET' });
        const body = await res.text();

        if (!res.ok || body !== challenge) {
            throw new Error('Notification Failed');
        }
    }

    async function verify(ctx: VerifyContext): Promise<void> {
        if (ctx.diffDomain) {
            await verifyChallenge(ctx.subscription.url, ctx.resourceUrl);
            return;
        }
        await sendNotify(ctx.subscription.url, notifyBody(ctx.resourceUrl));
    }

    return { protocols: REST_PROTOCOLS, verify, deliver };
}
