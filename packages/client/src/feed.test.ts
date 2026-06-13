import { Parser } from 'xml2js';
import { describe, expect, it } from 'vitest';
import { renderCloudFeed } from './feed.js';

function reparse(xml: string): Promise<unknown> {
    return new Parser({ explicitArray: false }).parseStringPromise(xml);
}

interface ParsedFeed {
    rss: {
        $: { version: string };
        channel: {
            title: string;
            link: string;
            description: string;
            cloud: { $: Record<string, string> };
            item:
                | { title: string; guid: string; pubDate: string }
                | { title: string; guid: string; pubDate: string }[];
        };
    };
}

const CLOUD = {
    domain: 'localhost',
    port: 5337,
    path: '/RPC2',
    registerProcedure: 'rssCloud.pleaseNotify',
    protocol: 'xml-rpc'
};

describe('renderCloudFeed', () => {
    it('renders a channel with the <cloud> element and an item', async () => {
        const xml = renderCloudFeed({
            title: 'Test Feed',
            link: 'http://sub.example:9000/rss-01.xml',
            description: 'Test feed for rssCloud',
            cloud: CLOUD,
            items: [
                {
                    title: 'Update one',
                    description: 'first',
                    pubDate: new Date('2026-01-02T03:04:05Z'),
                    guid: 'rss-01-0'
                }
            ]
        });

        const { rss } = (await reparse(xml)) as ParsedFeed;
        const channel = rss.channel;
        const item = channel.item as { title: string; guid: string; pubDate: string };
        expect(rss.$.version).toBe('2.0');
        expect(channel.title).toBe('Test Feed');
        expect(channel.link).toBe('http://sub.example:9000/rss-01.xml');
        expect(channel.cloud.$).toEqual({
            domain: 'localhost',
            port: '5337',
            path: '/RPC2',
            registerProcedure: 'rssCloud.pleaseNotify',
            protocol: 'xml-rpc'
        });
        expect(item.title).toBe('Update one');
        expect(item.guid).toBe('rss-01-0');
        expect(item.pubDate).toBe('Fri, 02 Jan 2026 03:04:05 GMT');
    });

    it('renders multiple items in order', async () => {
        const xml = renderCloudFeed({
            title: 'Test Feed',
            link: 'http://sub.example:9000/rss-01.xml',
            description: 'Test feed for rssCloud',
            cloud: CLOUD,
            items: [
                {
                    title: 'one',
                    description: 'a',
                    pubDate: new Date('2026-01-02T00:00:00Z'),
                    guid: 'g0'
                },
                {
                    title: 'two',
                    description: 'b',
                    pubDate: new Date('2026-01-03T00:00:00Z'),
                    guid: 'g1'
                }
            ]
        });

        const { rss } = (await reparse(xml)) as ParsedFeed;
        const items = rss.channel.item as { title: string }[];
        expect(items.map(i => i.title)).toEqual(['one', 'two']);
    });
});
