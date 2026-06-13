import { array, buildMethodCall, i4, str } from '@rsscloud/xml-rpc';

/** The wire-shaped inputs to the rssCloud `pleaseNotify` XML-RPC call. */
export interface PleaseNotifyParams {
    /** The procedure the hub should call to notify (e.g. `rssCloud.notify`);
     *  empty for non-XML-RPC callback protocols. */
    notifyProcedure: string;
    /** Port the hub should reach the callback on. */
    port: number;
    /** Path of the callback. */
    path: string;
    /** Protocol the hub should notify with (`http-post`/`https-post`/`xml-rpc`). */
    protocol: string;
    /** The feed URLs to subscribe to (the `urlList`). */
    urls: string[];
    /** The callback's domain. */
    domain: string;
}

/**
 * Build the rssCloud `pleaseNotify` `methodCall` — the six positional params in
 * wire order: notifyProcedure, port, path, protocol, urlList, domain.
 */
export function buildPleaseNotifyCall(params: PleaseNotifyParams): string {
    return buildMethodCall('rssCloud.pleaseNotify', [
        str(params.notifyProcedure),
        i4(params.port),
        str(params.path),
        str(params.protocol),
        array(params.urls.map(str)),
        str(params.domain)
    ]);
}

/** Build the rssCloud `ping` `methodCall` carrying a single feed URL. */
export function buildPingCall(feedUrl: string): string {
    return buildMethodCall('rssCloud.ping', [str(feedUrl)]);
}
