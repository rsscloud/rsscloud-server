import { bool, buildMethodResponse, parseMethodCall } from '@rsscloud/xml-rpc';

/**
 * Extract the changed resource URL from an http-post notification body — the hub
 * POSTs `url=<resourceUrl>` as an `application/x-www-form-urlencoded` form.
 */
export function parseHttpPostNotify(body: string): string {
    return new URLSearchParams(body).get('url') ?? '';
}

/**
 * Extract the changed resource URL from an XML-RPC `rssCloud.notify` methodCall
 * (the resource URL is its single param).
 */
export async function parseXmlRpcNotify(xml: string): Promise<string> {
    const { params } = await parseMethodCall(xml);
    const url = params[0];
    return typeof url === 'string' ? url : '';
}

/**
 * Build the boolean-true `methodResponse` a subscriber returns to acknowledge an
 * XML-RPC notification.
 */
export function buildNotifyResponse(): string {
    return buildMethodResponse(bool(true));
}
