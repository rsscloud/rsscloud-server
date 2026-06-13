import type {
    DeliveryContext,
    DeliveryResult,
    ProtocolPlugin,
    VerifyContext
} from '../engine/plugin.js';
import type { Protocol } from '../engine/protocol.js';
import { fetchWithTimeout } from '../fetch-with-timeout.js';
import { Builder } from 'xml2js';

/** Construction-time dependencies for the rssCloud XML-RPC protocol plugin. */
export interface XmlRpcProtocolPluginOptions {
    /** Injectable fetch (tests, edge runtimes); defaults to global fetch. */
    fetch?: typeof fetch;
    /** Per-request timeout (ms) for outbound calls. */
    requestTimeoutMs?: number;
}

const XML_RPC_PROTOCOLS: Protocol[] = ['xml-rpc'];

/** Fallback request timeout when none is supplied (mirrors the server default). */
const DEFAULT_REQUEST_TIMEOUT_MS = 4000;

/**
 * Build the rssCloud notify `methodCall`: the resource URL as a single untyped
 * (bare-string) param — the historical rssCloud notify shape. Kept here rather
 * than in the generic @rsscloud/xml-rpc builder, which only emits typed values.
 */
function buildNotifyCall(procedure: string, url: string): string {
    return new Builder().buildObject({
        methodCall: {
            methodName: procedure,
            params: { param: { value: url } }
        }
    });
}

/**
 * The rssCloud XML-RPC delivery protocol. Subscribers are notified with a
 * `methodCall` POST to their `notifyProcedure`. As with Dave's original
 * rssCloud, verification is a plain test notify — there is no cross-domain
 * challenge handshake, so `diffDomain` is ignored.
 */
export function createXmlRpcProtocolPlugin(
    options: XmlRpcProtocolPluginOptions = {}
): ProtocolPlugin {
    const doFetch = options.fetch ?? fetch;
    const requestTimeoutMs =
        options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    /** POST the notify methodCall; throws on timeout or non-2xx. */
    async function sendNotify(
        targetUrl: string,
        procedure: string,
        resourceUrl: string
    ): Promise<void> {
        const res = await fetchWithTimeout(doFetch, requestTimeoutMs, targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: buildNotifyCall(procedure, resourceUrl)
        });

        if (!res.ok) {
            throw new Error('Notification Failed');
        }
    }

    async function deliver(ctx: DeliveryContext): Promise<DeliveryResult> {
        try {
            await sendNotify(
                ctx.subscription.url,
                ctx.subscription.notifyProcedure ?? '',
                ctx.resource.url
            );
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err as Error };
        }
    }

    async function verify(ctx: VerifyContext): Promise<void> {
        await sendNotify(
            ctx.subscription.url,
            ctx.subscription.notifyProcedure ?? '',
            ctx.resourceUrl
        );
    }

    return { protocols: XML_RPC_PROTOCOLS, verify, deliver };
}
