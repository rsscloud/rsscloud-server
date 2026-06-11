import type { RssCloudCore } from '../engine/core.js';
import type { PingRequest, SubscribeRequest } from '../engine/dto.js';
import {
    appMessages,
    errorMessage,
    subscriptionFailureMessage,
    subscriptionRequestErrorMessage
} from './app-messages.js';
import {
    buildSubscribeRequest,
    type SubscribeParams
} from './subscribe-request.js';
import {
    parseMethodCall,
    serializeFault,
    serializeSuccess
} from './xml-rpc-codec.js';

/** Per-request context the adapter resolves before handing core the raw XML. */
export interface XmlRpcDispatchContext {
    /** Caller address (already resolved from x-forwarded-for/remote address). */
    clientAddress: string;
}

/** Construction-time dependencies for the XML-RPC dispatcher. */
export interface XmlRpcDispatcherOptions {
    core: Pick<RssCloudCore, 'subscribe' | 'ping'>;
}

/** Raw-XML-in, raw-XML-out rssCloud XML-RPC front door. */
export interface XmlRpcDispatcher {
    dispatch(xmlBody: string, ctx: XmlRpcDispatchContext): Promise<string>;
}

/** rssCloud faults are always faultCode 4. */
const FAULT_CODE = 4;

/**
 * Map `pleaseNotify` positional params
 * (`notifyProcedure, port, path, protocol, urlList[, domain]`) into a
 * `SubscribeRequest`. Owns only the positional-wire extraction and the arity
 * check; the callback-URL assembly, protocol validation, and `diffDomain`/scheme
 * rules live in {@link buildSubscribeRequest}. Throws (→ fault) on bad arity or
 * an unsupported protocol.
 */
function mapPleaseNotify(
    params: unknown[],
    clientAddress: string
): SubscribeRequest {
    if (params.length < 5) {
        throw new Error(appMessages.error.rpc.notEnoughParams('pleaseNotify'));
    }
    if (params.length > 6) {
        throw new Error(appMessages.error.rpc.tooManyParams('pleaseNotify'));
    }

    const urlList = params[4];
    const subscribeParams: SubscribeParams = {
        resourceUrls: Array.isArray(urlList)
            ? urlList.map((url) => String(url))
            : [String(urlList)],
        port: String(params[1]),
        path: String(params[2]),
        protocol: String(params[3]),
        clientAddress
    };

    if (params[5] !== undefined) {
        subscribeParams.domain = String(params[5]);
    }
    if (params[0]) {
        subscribeParams.notifyProcedure = String(params[0]);
    }

    return buildSubscribeRequest(subscribeParams);
}

/** Map the single `ping` param into a `PingRequest`. Throws (→ fault) on bad arity. */
function mapPing(params: unknown[]): PingRequest {
    if (params.length < 1) {
        throw new Error(appMessages.error.rpc.notEnoughParams('ping'));
    }
    if (params.length > 1) {
        throw new Error(appMessages.error.rpc.tooManyParams('ping'));
    }

    return { resourceUrl: String(params[0]) };
}

/**
 * Build the rssCloud XML-RPC dispatcher. It owns the whole round trip — parse
 * the `methodCall`, run the matching use case, and serialize the response —
 * and never throws: malformed input and use-case errors both become faults.
 */
export function createXmlRpcDispatcher(
    options: XmlRpcDispatcherOptions
): XmlRpcDispatcher {
    const { core } = options;

    /** Map params, subscribe, and relay success; mapping/subscribe errors fault. */
    async function handlePleaseNotify(
        params: unknown[],
        clientAddress: string
    ): Promise<string> {
        try {
            const result = await core.subscribe(
                mapPleaseNotify(params, clientAddress)
            );
            if (!result.success) {
                return serializeFault(
                    FAULT_CODE,
                    subscriptionFailureMessage(result.results, result.message)
                );
            }
            return serializeSuccess(true);
        } catch (err) {
            return serializeFault(
                FAULT_CODE,
                subscriptionRequestErrorMessage(err)
            );
        }
    }

    /**
     * Map params and ping. Per Dave's rssCloud, the response is always success
     * once the call is well-formed — even if the ping use case fails. Only a
     * malformed call (bad arity) faults.
     */
    async function handlePing(params: unknown[]): Promise<string> {
        let request: PingRequest;
        try {
            request = mapPing(params);
        } catch (err) {
            return serializeFault(FAULT_CODE, errorMessage(err));
        }

        try {
            await core.ping(request);
        } catch {
            // Dave's rssCloud server always returns true whether it succeeded or not.
        }
        return serializeSuccess(true);
    }

    async function dispatch(
        xmlBody: string,
        ctx: XmlRpcDispatchContext
    ): Promise<string> {
        let methodName: string;
        let params: unknown[];
        try {
            ({ methodName, params } = await parseMethodCall(xmlBody));
        } catch (err) {
            return serializeFault(FAULT_CODE, errorMessage(err));
        }

        switch (methodName) {
            case 'rssCloud.hello':
                return serializeSuccess(true);
            case 'rssCloud.pleaseNotify':
                return handlePleaseNotify(params, ctx.clientAddress);
            case 'rssCloud.ping':
                return handlePing(params);
            default:
                return serializeFault(
                    FAULT_CODE,
                    `Can't make the call because "${methodName}" is not defined.`
                );
        }
    }

    return { dispatch };
}
