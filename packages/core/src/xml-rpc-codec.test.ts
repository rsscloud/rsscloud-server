import { Parser } from 'xml2js';
import { describe, expect, it } from 'vitest';
import {
    buildNotifyCall,
    parseMethodCall,
    serializeFault,
    serializeSuccess
} from './xml-rpc-codec.js';

function reparse(xml: string): Promise<unknown> {
    return new Parser({ explicitArray: false }).parseStringPromise(xml);
}

describe('parseMethodCall', () => {
    it('decodes the method name and a single string param', async () => {
        const xml = `<?xml version="1.0"?>
            <methodCall>
                <methodName>rssCloud.ping</methodName>
                <params>
                    <param><value><string>http://feed.example/rss</string></value></param>
                </params>
            </methodCall>`;

        const call = await parseMethodCall(xml);

        expect(call.methodName).toBe('rssCloud.ping');
        expect(call.params).toEqual(['http://feed.example/rss']);
    });

    it('decodes an untyped (bare string) value', async () => {
        const xml =
            '<methodCall><methodName>m</methodName>' +
            '<params><param><value>bare text</value></param></params>' +
            '</methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual(['bare text']);
    });

    it('decodes several positional params in order', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params>' +
            '<param><value><string>first</string></value></param>' +
            '<param><value>second</value></param>' +
            '</params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual(['first', 'second']);
    });

    it('throws when the methodCall element is missing', async () => {
        await expect(parseMethodCall('<other/>')).rejects.toThrow(
            'missing "methodCall" element'
        );
    });

    it('throws when the methodName element is missing', async () => {
        const xml = '<methodCall><params/></methodCall>';

        await expect(parseMethodCall(xml)).rejects.toThrow(
            'missing "methodName" element'
        );
    });

    it('rejects malformed XML', async () => {
        await expect(parseMethodCall('<methodCall>')).rejects.toThrow();
    });

    it('decodes a methodCall with no params into an empty list', async () => {
        const xml = '<methodCall><methodName>rssCloud.hello</methodName></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.methodName).toBe('rssCloud.hello');
        expect(call.params).toEqual([]);
    });

    it('decodes numeric types (i4, int, double) as numbers', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params>' +
            '<param><value><i4>7</i4></value></param>' +
            '<param><value><int>5</int></value></param>' +
            '<param><value><double>1.5</double></value></param>' +
            '</params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([7, 5, 1.5]);
    });

    it('decodes booleans from textual "true" and numeric "1"', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params>' +
            '<param><value><boolean>true</boolean></value></param>' +
            '<param><value><boolean>1</boolean></value></param>' +
            '<param><value><boolean>0</boolean></value></param>' +
            '</params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([true, true, false]);
    });

    it('decodes a valid dateTime.iso8601 into a Date', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params>' +
            '<param><value><dateTime.iso8601>2013-01-02T03:04:05Z' +
            '</dateTime.iso8601></value></param>' +
            '</params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params[0]).toBeInstanceOf(Date);
        expect((call.params[0] as Date).toISOString()).toBe(
            '2013-01-02T03:04:05.000Z'
        );
    });

    it('keeps an unparseable dateTime.iso8601 as the raw string', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params>' +
            '<param><value><dateTime.iso8601>not-a-date' +
            '</dateTime.iso8601></value></param>' +
            '</params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual(['not-a-date']);
    });

    it('decodes base64 into a UTF-8 string', async () => {
        const encoded = Buffer.from('héllo', 'utf8').toString('base64');
        const xml =
            '<methodCall><methodName>m</methodName><params>' +
            `<param><value><base64>${encoded}</base64></value></param>` +
            '</params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual(['héllo']);
    });

    it('decodes a struct with several members into an object', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params><param><value>' +
            '<struct>' +
            '<member><name>host</name><value><string>rpc.example' +
            '</string></value></member>' +
            '<member><name>port</name><value><int>80</int></value></member>' +
            '</struct>' +
            '</value></param></params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([{ host: 'rpc.example', port: 80 }]);
    });

    it('decodes a single-member struct into an object', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params><param><value>' +
            '<struct><member><name>only</name><value><string>one' +
            '</string></value></member></struct>' +
            '</value></param></params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([{ only: 'one' }]);
    });

    it('decodes an empty struct into an empty object', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params><param><value>' +
            '<struct></struct></value></param></params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([{}]);
    });

    it('decodes an array with several elements', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params><param><value>' +
            '<array><data>' +
            '<value><string>a</string></value>' +
            '<value><string>b</string></value>' +
            '</data></array>' +
            '</value></param></params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([['a', 'b']]);
    });

    it('coerces a single-element array', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params><param><value>' +
            '<array><data><value><string>only</string></value></data></array>' +
            '</value></param></params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([['only']]);
    });

    it('decodes an empty array into an empty list', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params><param><value>' +
            '<array><data></data></array></value></param></params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([[]]);
    });

    it('decodes an array node with no data into an empty list', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params><param><value>' +
            '<array></array></value></param></params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([[]]);
    });

    it('returns the raw node for an unknown value type', async () => {
        const xml =
            '<methodCall><methodName>m</methodName><params><param><value>' +
            '<unknownType>x</unknownType></value></param></params></methodCall>';

        const call = await parseMethodCall(xml);

        expect(call.params).toEqual([{ unknownType: 'x' }]);
    });
});

describe('serializeSuccess', () => {
    it('emits a methodResponse boolean of 1 for true', async () => {
        const parsed = (await reparse(serializeSuccess(true))) as {
            methodResponse: { params: { param: { value: { boolean: string } } } };
        };

        expect(parsed.methodResponse.params.param.value.boolean).toBe('1');
    });

    it('emits a methodResponse boolean of 0 for false', async () => {
        const parsed = (await reparse(serializeSuccess(false))) as {
            methodResponse: { params: { param: { value: { boolean: string } } } };
        };

        expect(parsed.methodResponse.params.param.value.boolean).toBe('0');
    });
});

describe('serializeFault', () => {
    it('emits the faultCode/faultString struct, entities surviving', async () => {
        const message = 'Bad <i>protocol</i> & stuff';
        const parsed = (await reparse(serializeFault(4, message))) as {
            methodResponse: {
                fault: {
                    value: {
                        struct: {
                            member: { name: string; value: Record<string, string> }[];
                        };
                    };
                };
            };
        };

        const members = parsed.methodResponse.fault.value.struct.member;
        expect(members[0]?.name).toBe('faultCode');
        expect(members[0]?.value['int']).toBe('4');
        expect(members[1]?.name).toBe('faultString');
        expect(members[1]?.value['string']).toBe(message);
    });
});

describe('buildNotifyCall', () => {
    it('builds a methodCall that round-trips back to its procedure and url', async () => {
        const xml = buildNotifyCall(
            'myCloud.notify',
            'https://feed.example/rss'
        );

        const call = await parseMethodCall(xml);

        expect(call.methodName).toBe('myCloud.notify');
        expect(call.params).toEqual(['https://feed.example/rss']);
    });

    it('emits an empty methodName when the procedure is blank', async () => {
        const call = await parseMethodCall(
            buildNotifyCall('', 'https://feed.example/rss')
        );

        expect(call.methodName).toBe('');
        expect(call.params).toEqual(['https://feed.example/rss']);
    });
});
