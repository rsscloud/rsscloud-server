import { buildPingCall, buildPleaseNotifyCall } from './rpc-calls.js';

/** The notification protocol a subscriber asks the hub to use. */
export type NotifyProtocol = 'http-post' | 'https-post' | 'xml-rpc';

/** Where the hub should deliver notifications for a subscription. */
export interface Callback {
    domain: string;
    port: number;
    path: string;
}

/** Construction-time dependencies for the client. */
export interface RssCloudClientOptions {
    /** Base URL of the rssCloud hub (trailing slash optional). */
    serverUrl: string;
    /** Injectable fetch (tests, edge runtimes); defaults to global fetch. */
    fetch?: typeof fetch;
}

/** A `pleaseNotify` subscription request. */
export interface PleaseNotifyOptions {
    /** Notification protocol; `xml-rpc` registers over `/RPC2`, the rest over REST. */
    protocol: NotifyProtocol;
    callback: Callback;
    feedUrl: string;
}

/** A `ping` change signal. */
export interface PingOptions {
    feedUrl: string;
    /** Front door to use; `rest` posts to `/ping`, `xml-rpc` to `/RPC2`. Default `rest`. */
    transport?: 'rest' | 'xml-rpc';
}

/** The hub's raw reply. */
export interface RssCloudResponse {
    status: number;
    body: string;
}

/** The subscriber + publisher operations against one hub. */
export interface RssCloudClient {
    pleaseNotify(opts: PleaseNotifyOptions): Promise<RssCloudResponse>;
    ping(opts: PingOptions): Promise<RssCloudResponse>;
}

const FORM_TYPE = 'application/x-www-form-urlencoded';
const XML_TYPE = 'text/xml';

/**
 * Build a client bound to one hub. `pleaseNotify`/`ping` choose their front door
 * from the request shape (mirroring the reference test client): an `xml-rpc`
 * subscription and an `xml-rpc` ping go to `/RPC2`; everything else uses the REST
 * front doors. The outbound `fetch` is injectable for tests.
 */
export function createRssCloudClient(
    options: RssCloudClientOptions
): RssCloudClient {
    const doFetch = options.fetch ?? fetch;
    const base = options.serverUrl.replace(/\/$/, '');

    async function send(
        path: string,
        contentType: string,
        body: string
    ): Promise<RssCloudResponse> {
        const res = await doFetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': contentType },
            body
        });
        return { status: res.status, body: await res.text() };
    }

    async function pleaseNotify(
        opts: PleaseNotifyOptions
    ): Promise<RssCloudResponse> {
        if (opts.protocol === 'xml-rpc') {
            return send(
                '/RPC2',
                XML_TYPE,
                buildPleaseNotifyCall({
                    notifyProcedure: 'rssCloud.notify',
                    port: opts.callback.port,
                    path: opts.callback.path,
                    protocol: opts.protocol,
                    urls: [opts.feedUrl],
                    domain: opts.callback.domain
                })
            );
        }
        const form = new URLSearchParams({
            port: String(opts.callback.port),
            path: opts.callback.path,
            protocol: opts.protocol,
            url1: opts.feedUrl
        });
        return send('/pleaseNotify', FORM_TYPE, form.toString());
    }

    async function ping(opts: PingOptions): Promise<RssCloudResponse> {
        if (opts.transport === 'xml-rpc') {
            return send('/RPC2', XML_TYPE, buildPingCall(opts.feedUrl));
        }
        return send(
            '/ping',
            FORM_TYPE,
            new URLSearchParams({ url: opts.feedUrl }).toString()
        );
    }

    return { pleaseNotify, ping };
}
