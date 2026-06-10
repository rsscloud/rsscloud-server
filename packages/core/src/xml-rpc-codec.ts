import { Builder, Parser } from 'xml2js';

/** A decoded XML-RPC `methodCall`: its method name and positional params. */
export interface MethodCall {
    methodName: string;
    params: unknown[];
}

/** xml2js node as a record, or null for primitives (the `explicitArray:false` shape). */
function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object'
        ? (value as Record<string, unknown> | null)
        : null;
}

/** Normalise xml2js's "scalar | single | array" into an array. */
function toArray(value: unknown): unknown[] {
    if (value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

/** Decode `dateTime.iso8601` with native `Date`; keep the raw text if unparseable. */
function decodeDate(raw: unknown): Date | string {
    const text = String(raw);
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date;
}

/** Decode a `<struct>` node into a plain object keyed by member name. */
function decodeStruct(node: unknown): Record<string, unknown> {
    const rec = asRecord(node);
    const members = toArray(rec === null ? undefined : rec['member']);
    const out: Record<string, unknown> = {};
    for (const member of members) {
        const m = member as Record<string, unknown>;
        out[String(m['name'])] = decode(member);
    }
    return out;
}

/** Decode an `<array>` node into a list, recursively decoding each `<value>`. */
function decodeArray(node: unknown): unknown[] {
    const rec = asRecord(node);
    const data = rec === null ? null : asRecord(rec['data']);
    const values = toArray(data === null ? undefined : data['value']);
    return values.map(decode);
}

/** Decode a typed `<value>` body (`{ <type>: ... }`) by its single type tag. */
function decodeTyped(typed: Record<string, unknown>): unknown {
    for (const tag of Object.keys(typed)) {
        switch (tag) {
            case 'i4':
            case 'int':
            case 'double':
                return Number(typed[tag]);
            case 'string':
                return typed[tag];
            case 'boolean':
                return typed[tag] === 'true' || Boolean(Number(typed[tag]));
            case 'dateTime.iso8601':
                return decodeDate(typed[tag]);
            case 'base64':
                return Buffer.from(String(typed[tag]), 'base64').toString(
                    'utf8'
                );
            case 'struct':
                return decodeStruct(typed[tag]);
            case 'array':
                return decodeArray(typed[tag]);
        }
    }
    return typed;
}

/** Decode one `<value>` (or its wrapping `<param>`/`<member>`) into a JS value. */
function decode(node: unknown): unknown {
    const wrapper = asRecord(node);
    const value =
        wrapper !== null && 'value' in wrapper ? wrapper['value'] : node;

    const typed = asRecord(value);
    if (typed === null) {
        return value;
    }

    return decodeTyped(typed);
}

/**
 * Decode an XML-RPC `methodCall` document. Throws on malformed XML or a missing
 * `methodCall`/`methodName` element.
 */
export async function parseMethodCall(xml: string): Promise<MethodCall> {
    const parser = new Parser({ explicitArray: false });
    const parsed = (await parser.parseStringPromise(xml)) as Record<
        string,
        unknown
    >;

    const methodCall = asRecord(parsed['methodCall']);
    if (methodCall === null) {
        throw new Error('Bad XML-RPC call, missing "methodCall" element.');
    }

    const methodName = methodCall['methodName'];
    if (methodName === undefined) {
        throw new Error('Bad XML-RPC call, missing "methodName" element.');
    }

    const paramsNode = asRecord(methodCall['params']);
    const paramRaw = paramsNode === null ? undefined : paramsNode['param'];
    const params = toArray(paramRaw).map(decode);

    return { methodName: String(methodName), params };
}

/** Serialize a `methodResponse` carrying a single boolean param. */
export function serializeSuccess(success: boolean): string {
    return new Builder().buildObject({
        methodResponse: {
            params: {
                param: { value: { boolean: success ? 1 : 0 } }
            }
        }
    });
}

/**
 * Build a `methodCall` to `procedure` carrying the resource URL as a single
 * untyped (string) param — the rssCloud XML-RPC notify shape.
 */
export function buildNotifyCall(procedure: string, url: string): string {
    return new Builder().buildObject({
        methodCall: {
            methodName: procedure,
            params: { param: { value: url } }
        }
    });
}

/** Serialize a `methodResponse` fault with the standard faultCode/faultString struct. */
export function serializeFault(code: number, str: string): string {
    return new Builder().buildObject({
        methodResponse: {
            fault: {
                value: {
                    struct: {
                        member: [
                            { name: 'faultCode', value: { int: code } },
                            { name: 'faultString', value: { string: str } }
                        ]
                    }
                }
            }
        }
    });
}
