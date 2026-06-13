import { Parser } from 'xml2js';
import { describe, expect, it } from 'vitest';
import {
    array,
    bool,
    buildFault,
    buildMethodCall,
    buildMethodResponse,
    i4,
    int,
    str,
    struct
} from './build.js';
import { parseMethodCall } from './parse.js';

function reparse(xml: string): Promise<unknown> {
    return new Parser({ explicitArray: false }).parseStringPromise(xml);
}

describe('buildMethodCall', () => {
    it('builds a methodCall that round-trips to its name and a string param', async () => {
        const call = await parseMethodCall(
            buildMethodCall('rssCloud.ping', [str('https://feed.example/rss')])
        );

        expect(call.methodName).toBe('rssCloud.ping');
        expect(call.params).toEqual(['https://feed.example/rss']);
    });

    it('round-trips i4 and int as numbers', async () => {
        const call = await parseMethodCall(
            buildMethodCall('m', [i4(5337), int(80)])
        );

        expect(call.params).toEqual([5337, 80]);
    });

    it('round-trips a boolean', async () => {
        const call = await parseMethodCall(
            buildMethodCall('m', [bool(true), bool(false)])
        );

        expect(call.params).toEqual([true, false]);
    });

    it('round-trips an array of strings', async () => {
        const call = await parseMethodCall(
            buildMethodCall('m', [array([str('a'), str('b')])])
        );

        expect(call.params).toEqual([['a', 'b']]);
    });

    it('round-trips an empty array', async () => {
        const call = await parseMethodCall(
            buildMethodCall('m', [array([])])
        );

        expect(call.params).toEqual([[]]);
    });

    it('round-trips a struct keyed by member name', async () => {
        const call = await parseMethodCall(
            buildMethodCall('m', [
                struct({ host: str('rpc.example'), port: i4(80) })
            ])
        );

        expect(call.params).toEqual([{ host: 'rpc.example', port: 80 }]);
    });

    it('preserves positional param order', async () => {
        const call = await parseMethodCall(
            buildMethodCall('rssCloud.pleaseNotify', [
                str('rssCloud.notify'),
                i4(9000),
                str('/RPC2'),
                str('xml-rpc'),
                array([str('https://feed.example/rss')]),
                str('example.com')
            ])
        );

        expect(call.methodName).toBe('rssCloud.pleaseNotify');
        expect(call.params).toEqual([
            'rssCloud.notify',
            9000,
            '/RPC2',
            'xml-rpc',
            ['https://feed.example/rss'],
            'example.com'
        ]);
    });

    it('builds a no-param methodCall that decodes to an empty list', async () => {
        const call = await parseMethodCall(buildMethodCall('rssCloud.hello', []));

        expect(call.methodName).toBe('rssCloud.hello');
        expect(call.params).toEqual([]);
    });
});

describe('buildMethodResponse', () => {
    it('emits a boolean methodResponse of 1 for true', async () => {
        const parsed = (await reparse(buildMethodResponse(bool(true)))) as {
            methodResponse: { params: { param: { value: { boolean: string } } } };
        };

        expect(parsed.methodResponse.params.param.value.boolean).toBe('1');
    });

    it('emits a boolean methodResponse of 0 for false', async () => {
        const parsed = (await reparse(buildMethodResponse(bool(false)))) as {
            methodResponse: { params: { param: { value: { boolean: string } } } };
        };

        expect(parsed.methodResponse.params.param.value.boolean).toBe('0');
    });
});

describe('buildFault', () => {
    it('emits the faultCode/faultString struct, entities surviving', async () => {
        const message = 'Bad <i>protocol</i> & stuff';
        const parsed = (await reparse(buildFault(4, message))) as {
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
