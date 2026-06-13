import { Parser } from 'xml2js';
import { describe, expect, it } from 'vitest';
import { buildPingCall } from './rpc-calls.js';
import {
    buildNotifyResponse,
    parseHttpPostNotify,
    parseXmlRpcNotify
} from './notify.js';

// A notify methodCall has the same one-URL-param shape as ping, so buildPingCall
// is a convenient way to mint a well-formed notify body.
function notifyXml(url: string): string {
    return buildPingCall(url).replace('rssCloud.ping', 'rssCloud.notify');
}

describe('parseXmlRpcNotify', () => {
    it('extracts the changed resource URL from a notify methodCall', async () => {
        const url = await parseXmlRpcNotify(notifyXml('https://feed.example/rss'));

        expect(url).toBe('https://feed.example/rss');
    });

    it('returns an empty string when the call carries no param', async () => {
        const url = await parseXmlRpcNotify(
            '<methodCall><methodName>rssCloud.notify</methodName></methodCall>'
        );

        expect(url).toBe('');
    });
});

describe('parseHttpPostNotify', () => {
    it('extracts the changed resource URL from the form body', () => {
        expect(parseHttpPostNotify('url=https%3A%2F%2Ffeed.example%2Frss')).toBe(
            'https://feed.example/rss'
        );
    });

    it('returns an empty string when the form has no url', () => {
        expect(parseHttpPostNotify('other=1')).toBe('');
    });
});

describe('buildNotifyResponse', () => {
    it('builds a boolean-true methodResponse', async () => {
        const parsed = (await new Parser({
            explicitArray: false
        }).parseStringPromise(buildNotifyResponse())) as {
            methodResponse: { params: { param: { value: { boolean: string } } } };
        };

        expect(parsed.methodResponse.params.param.value.boolean).toBe('1');
    });
});
