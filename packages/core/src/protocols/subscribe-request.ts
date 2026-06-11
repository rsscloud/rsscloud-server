import type { SubscribeRequest } from '../engine/dto.js';
import type { Protocol } from '../engine/protocol.js';
import { appMessages } from './app-messages.js';

/** Protocols a subscriber may register under. */
const VALID_PROTOCOLS = ['http-post', 'https-post', 'xml-rpc'];

/**
 * The wire-neutral subscribe fields a front door has already pulled off its
 * transport — the input to {@link buildSubscribeRequest}. Each dispatcher does
 * its own extraction (form keys vs. positional params) and presence/arity
 * validation, then hands the shared builder these fields.
 */
export interface SubscribeParams {
    /** Feeds/topics the subscriber wants notifications for. */
    resourceUrls: string[];
    /** Callback port. */
    port: string;
    /** Callback path. */
    path: string;
    /** Requested delivery protocol (validated by the builder). */
    protocol: string;
    /** Caller address, used as the callback host when no `domain` is given. */
    clientAddress: string;
    /** Explicit callback host; absent/empty means "use the caller address". */
    domain?: string;
    /** XML-RPC notify method, honoured only for the `xml-rpc` protocol. */
    notifyProcedure?: string;
}

/** Assemble a callback URL from its parts the way the legacy `glueUrlParts` did. */
function glueUrlParts(
    scheme: string,
    client: string,
    port: string,
    path: string
): string {
    let host = client;
    if (host.startsWith('::ffff:')) {
        host = host.slice(7);
    }
    if (host.includes(':')) {
        host = `[${host}]`;
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${scheme}://${host}:${port}${normalizedPath}`;
}

/** Assemble a {@link SubscribeRequest} from the wire-neutral subscribe fields. */
export function buildSubscribeRequest(
    params: SubscribeParams
): SubscribeRequest {
    if (!VALID_PROTOCOLS.includes(params.protocol)) {
        throw new Error(
            appMessages.error.subscription.invalidProtocol(params.protocol)
        );
    }

    // An absent or empty domain means "use the caller address" (ADR-0001).
    const explicitDomain = params.domain !== undefined && params.domain !== '';
    const host = explicitDomain ? params.domain! : params.clientAddress;
    const scheme =
        params.protocol === 'https-post' || params.port === '443'
            ? 'https'
            : 'http';
    const request: SubscribeRequest = {
        resourceUrls: params.resourceUrls,
        callbackUrl: glueUrlParts(scheme, host, params.port, params.path),
        protocol: params.protocol as Protocol,
        diffDomain: explicitDomain
    };
    if (params.notifyProcedure && params.protocol === 'xml-rpc') {
        request.notifyProcedure = params.notifyProcedure;
    }
    return request;
}
