import type {
    DeliveryResult,
    ProtocolPlugin,
    VerifyContext
} from '../engine/plugin.js';
import type { Protocol } from '../engine/protocol.js';
import { fetchWithTimeout } from '../fetch-with-timeout.js';

/** Construction-time dependencies for the WebSub protocol plugin. */
export interface WebSubProtocolPluginOptions {
    /** Injectable fetch (tests, edge runtimes); defaults to global fetch. */
    fetch?: typeof fetch;
    /** Per-request timeout (ms) for outbound calls. */
    requestTimeoutMs?: number;
    /** Challenge generator for the intent-verification GET (injectable for tests). */
    createChallenge?: () => string;
}

const WEBSUB_PROTOCOLS: Protocol[] = ['websub'];

/** Fallback request timeout when none is supplied (mirrors the server default). */
const DEFAULT_REQUEST_TIMEOUT_MS = 4000;

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
    const requestTimeoutMs =
        options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const createChallenge = options.createChallenge ?? defaultCreateChallenge;

    async function verify(ctx: VerifyContext): Promise<void> {
        const challenge = createChallenge();
        const verifyUrl = new URL(ctx.subscription.url);
        verifyUrl.searchParams.set('hub.mode', 'subscribe');
        verifyUrl.searchParams.set('hub.topic', ctx.resourceUrl);
        verifyUrl.searchParams.set('hub.challenge', challenge);

        const res = await fetchWithTimeout(
            doFetch,
            requestTimeoutMs,
            verifyUrl.toString(),
            { method: 'GET' }
        );
        const body = await res.text();

        if (!res.ok || body !== challenge) {
            throw new Error('WebSub intent verification failed');
        }
    }

    // Content distribution lands in S2.1; until then delivery reports failure
    // rather than throwing (the engine's deliverTo does not catch). The context
    // parameter is omitted until the real implementation consumes it.
    function deliver(): Promise<DeliveryResult> {
        return Promise.resolve({
            ok: false,
            error: new Error('WebSub content distribution not implemented')
        });
    }

    return { protocols: WEBSUB_PROTOCOLS, verify, deliver };
}
