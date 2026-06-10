import { Builder } from 'xml2js';
import type { RssCloudCore } from '../engine/core.js';
import type { PingRequest, SubscribeRequest } from '../engine/dto.js';
import type { Protocol } from '../engine/protocol.js';
import { RssCloudError } from '../errors.js';
import {
    appMessages,
    errorMessage,
    subscriptionFailureMessage,
    subscriptionRequestErrorMessage
} from './app-messages.js';

/** Negotiated response format the adapter resolved from the `Accept` header. */
export type RestResponseFormat = 'xml' | 'json' | null;

/** Per-request context the adapter resolves before handing the front door a body. */
export interface RestDispatchContext {
    /** Caller address (already resolved from x-forwarded-for/remote address). */
    clientAddress: string;
    /** Negotiated response format; `null` → 406 Not Acceptable. */
    format: RestResponseFormat;
}

/** A fully-rendered HTTP response the adapter copies onto its framework's reply. */
export interface RestResponse {
    status: number;
    contentType: string;
    body: string;
}

/** Construction-time dependencies for the REST dispatcher. */
export interface RestDispatcherOptions {
    core: Pick<RssCloudCore, 'subscribe' | 'ping'>;
}

/** Parsed-body-in, rendered-response-out rssCloud REST front door. */
export interface RestDispatcher {
    pleaseNotify(
        body: Record<string, unknown>,
        ctx: RestDispatchContext
    ): Promise<RestResponse>;
    ping(
        body: Record<string, unknown>,
        ctx: RestDispatchContext
    ): Promise<RestResponse>;
}

/** The wire-neutral outcome the renderer turns into xml/json. */
interface RestResult {
    success: boolean;
    message: string;
}

/**
 * The wire message for a failed ping: a coded unreadable-resource error gets the
 * ping-specific wording; anything else (e.g. a missing url) keeps its message.
 */
function pingFailureMessage(
    err: unknown,
    body: Record<string, unknown>
): string {
    if (err instanceof RssCloudError && err.code === 'RESOURCE_READ_FAILED') {
        return appMessages.error.ping.readResource(String(body['url']));
    }
    return errorMessage(err);
}

/** Map the REST ping body into a `PingRequest`. Throws (→ failure) on a missing url. */
function mapPing(body: Record<string, unknown>): PingRequest {
    if (body['url'] === undefined) {
        throw new Error(appMessages.error.subscription.missingParams('url'));
    }
    return { resourceUrl: String(body['url']) };
}

/** Protocols a subscriber may register under. */
const VALID_PROTOCOLS = ['http-post', 'https-post', 'xml-rpc'];

/** Collect every `url*` body key (any case) into a resource list. */
function parseUrlList(body: Record<string, unknown>): string[] {
    const urls: string[] = [];
    for (const key of Object.keys(body)) {
        if (key.toLowerCase().startsWith('url')) {
            urls.push(String(body[key]));
        }
    }
    return urls;
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

/**
 * Map the REST `pleaseNotify` body (`port`, `path`, `protocol`, any `url*`,
 * optional `domain`/`notifyProcedure`) into a `SubscribeRequest`. Throws
 * (→ failure) on missing required params or an unsupported protocol.
 */
function mapPleaseNotify(
    body: Record<string, unknown>,
    clientAddress: string
): SubscribeRequest {
    const missing: string[] = [];
    if (body['port'] === undefined) {
        missing.push('port');
    }
    if (body['path'] === undefined) {
        missing.push('path');
    }
    if (body['protocol'] === undefined) {
        missing.push('protocol');
    }
    if (missing.length > 0) {
        throw new Error(
            appMessages.error.subscription.missingParams(missing.join(', '))
        );
    }

    const protocol = String(body['protocol']);
    if (!VALID_PROTOCOLS.includes(protocol)) {
        throw new Error(
            appMessages.error.subscription.invalidProtocol(protocol)
        );
    }

    const port = String(body['port']);
    const path = String(body['path']);
    const domain = body['domain'];

    let client: string;
    let diffDomain: boolean;
    if (domain === undefined || domain === null || domain === '') {
        client = clientAddress;
        diffDomain = false;
    } else {
        client = String(domain);
        diffDomain = true;
    }

    const scheme =
        protocol === 'https-post' || port === '443' ? 'https' : 'http';

    const request: SubscribeRequest = {
        resourceUrls: parseUrlList(body),
        callbackUrl: glueUrlParts(scheme, client, port, path),
        protocol: protocol as Protocol,
        diffDomain
    };

    if (body['notifyProcedure'] && protocol === 'xml-rpc') {
        request.notifyProcedure = String(body['notifyProcedure']);
    }

    return request;
}

/** Serialize a result as a `<element success msg/>` document. */
function serializeXml(element: string, result: RestResult): string {
    return new Builder().buildObject({
        [element]: {
            $: {
                success: result.success ? 'true' : 'false',
                msg: result.message
            }
        }
    });
}

/** Render a result in the negotiated format. The XML element names the use case. */
function render(
    format: RestResponseFormat,
    element: string,
    result: RestResult
): RestResponse {
    if (format === 'xml') {
        return {
            status: 200,
            contentType: 'text/xml',
            body: serializeXml(element, result)
        };
    }
    if (format === 'json') {
        return {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: result.success,
                msg: result.message
            })
        };
    }
    return { status: 406, contentType: 'text/plain', body: 'Not Acceptable' };
}

/** Build the rssCloud REST front door. */
export function createRestDispatcher(
    options: RestDispatcherOptions
): RestDispatcher {
    const { core } = options;

    async function pleaseNotify(
        body: Record<string, unknown>,
        ctx: RestDispatchContext
    ): Promise<RestResponse> {
        let result: RestResult;
        try {
            const response = await core.subscribe(
                mapPleaseNotify(body, ctx.clientAddress)
            );
            result = {
                success: response.success,
                message: response.success
                    ? appMessages.success.subscription
                    : subscriptionFailureMessage(
                          response.results,
                          response.message
                      )
            };
        } catch (err) {
            result = {
                success: false,
                message: subscriptionRequestErrorMessage(err)
            };
        }
        return render(ctx.format, 'notifyResult', result);
    }

    async function ping(
        body: Record<string, unknown>,
        ctx: RestDispatchContext
    ): Promise<RestResponse> {
        let result: RestResult;
        try {
            const response = await core.ping(mapPing(body));
            result = {
                success: response.success,
                message: response.message
            };
        } catch (err) {
            result = { success: false, message: pingFailureMessage(err, body) };
        }
        return render(ctx.format, 'result', result);
    }

    return { pleaseNotify, ping };
}
