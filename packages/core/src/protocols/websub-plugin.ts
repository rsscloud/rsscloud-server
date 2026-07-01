import { createHmac } from 'node:crypto';
import type {
    DeliveryContext,
    DeliveryResult,
    ProtocolPlugin,
    VerifyContext
} from '../engine/plugin.js';
import type { Protocol } from '../engine/protocol.js';

/** Construction-time dependencies for the WebSub protocol plugin. */
export interface WebSubProtocolPluginOptions {
    /**
     * Injectable fetch (tests, edge runtimes); defaults to global fetch. A host
     * should inject a fetch that carries its own outbound timeout and SSRF guard
     * (see the server's createSafeFetch wiring).
     */
    fetch?: typeof fetch;
    /** Challenge generator for the intent-verification GET (injectable for tests). */
    createChallenge?: () => string;
    /**
     * The hub's externally-reachable URL, advertised to subscribers in the
     * `Link rel="hub"` header on every content distribution. Required for
     * `deliver`; a host always injects it (see `apps/server`).
     */
    hubUrl?: string;
    /**
     * HMAC algorithm for the `X-Hub-Signature` header when a subscriber
     * supplied a `hub.secret`. Names the digest and the header method prefix
     * (`<algo>=<hex>`). Defaults to `sha256`.
     */
    signatureAlgo?: string;
}

const WEBSUB_PROTOCOLS: Protocol[] = ['websub'];

/** Max redirect hops a single content-distribution delivery will follow. */
const MAX_REDIRECTS = 5;

/** Portable, hard-to-guess token for the intent-verification challenge. */
function defaultCreateChallenge(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(
        ''
    );
}

/**
 * The WebSub delivery protocol (`websub`). A new subscription's intent is always
 * confirmed with the WebSub verification GET (the spec mandate) — never the
 * rssCloud same-domain test-notify — so `verify` ignores `diffDomain`.
 */
export function createWebSubProtocolPlugin(
    options: WebSubProtocolPluginOptions = {}
): ProtocolPlugin {
    const doFetch = options.fetch ?? fetch;
    const createChallenge = options.createChallenge ?? defaultCreateChallenge;
    const hubUrl = options.hubUrl;
    const signatureAlgo = options.signatureAlgo ?? 'sha256';

    async function verify(ctx: VerifyContext): Promise<void> {
        const challenge = createChallenge();
        const verifyUrl = new URL(ctx.subscription.url);
        verifyUrl.searchParams.set('hub.mode', ctx.mode ?? 'subscribe');
        verifyUrl.searchParams.set('hub.topic', ctx.resourceUrl);
        verifyUrl.searchParams.set('hub.challenge', challenge);
        if (ctx.leaseSeconds !== undefined) {
            verifyUrl.searchParams.set(
                'hub.lease_seconds',
                String(ctx.leaseSeconds)
            );
        }

        const res = await doFetch(verifyUrl.toString(), { method: 'GET' });
        const body = await res.text();

        if (!res.ok || body !== challenge) {
            throw new Error('WebSub intent verification failed');
        }
    }

    /**
     * POST the feed body to one callback, following redirects like rssCloud
     * notify, but bounded by `redirectsLeft` so a self-redirecting callback
     * can't loop the delivery task forever.
     */
    async function distribute(
        targetUrl: string,
        ctx: DeliveryContext,
        redirectsLeft = MAX_REDIRECTS
    ): Promise<void> {
        if (hubUrl === undefined) {
            // The Link rel="hub" advertisement needs the hub's own URL; without
            // it we'd POST a malformed `<undefined>` header. Fail the delivery
            // instead (a host always injects hubUrl — see apps/server).
            throw new Error('WebSub hub URL is not configured');
        }
        const headers: Record<string, string> = {
            'Content-Type':
                ctx.payload.contentType ?? 'application/octet-stream',
            Link: `<${hubUrl}>; rel="hub", <${ctx.resource.url}>; rel="self"`
        };

        const secret = ctx.subscription.details?.['secret'];
        if (typeof secret === 'string') {
            const digest = createHmac(signatureAlgo, secret)
                .update(ctx.payload.body)
                .digest('hex');
            headers['X-Hub-Signature'] = `${signatureAlgo}=${digest}`;
        }

        const res = await doFetch(targetUrl, {
            method: 'POST',
            headers,
            body: ctx.payload.body,
            redirect: 'manual'
        });

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (location) {
                if (redirectsLeft <= 0) {
                    throw new Error(
                        'WebSub content distribution exceeded the redirect limit'
                    );
                }
                await distribute(
                    new URL(location, targetUrl).toString(),
                    ctx,
                    redirectsLeft - 1
                );
                return;
            }
        }

        if (!res.ok) {
            throw new Error('WebSub content distribution failed');
        }
    }

    async function deliver(ctx: DeliveryContext): Promise<DeliveryResult> {
        try {
            await distribute(ctx.subscription.url, ctx);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err as Error };
        }
    }

    return { protocols: WEBSUB_PROTOCOLS, verify, deliver };
}
