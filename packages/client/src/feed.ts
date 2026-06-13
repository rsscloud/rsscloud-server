import { Builder } from 'xml2js';

/** The `<cloud>` element advertising where to subscribe for change notifications. */
export interface CloudElement {
    domain: string;
    port: number;
    path: string;
    registerProcedure: string;
    protocol: string;
}

/** One `<item>` in the rendered feed. */
export interface FeedItem {
    title: string;
    description: string;
    pubDate: Date;
    guid: string;
}

/** Inputs for {@link renderCloudFeed}. */
export interface CloudFeedOptions {
    title: string;
    link: string;
    description: string;
    cloud: CloudElement;
    items: FeedItem[];
}

/**
 * Render an RSS 2.0 feed carrying a `<cloud>` element — the document a publisher
 * serves so a hub knows where to register for its change notifications. Item
 * `pubDate`s are emitted in RFC 822 form.
 */
export function renderCloudFeed(opts: CloudFeedOptions): string {
    return new Builder().buildObject({
        rss: {
            $: { version: '2.0' },
            channel: {
                title: opts.title,
                link: opts.link,
                description: opts.description,
                cloud: {
                    $: {
                        domain: opts.cloud.domain,
                        port: String(opts.cloud.port),
                        path: opts.cloud.path,
                        registerProcedure: opts.cloud.registerProcedure,
                        protocol: opts.cloud.protocol
                    }
                },
                item: opts.items.map(item => ({
                    title: item.title,
                    description: item.description,
                    pubDate: item.pubDate.toUTCString(),
                    guid: item.guid
                }))
            }
        }
    });
}
