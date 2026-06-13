import { Builder } from 'xml2js';

/**
 * A typed XML-RPC value to encode. Built with the constructor helpers below
 * (`str`, `i4`, …) so callers stay explicit about the wire type — `i4` vs a
 * bare number can't be inferred, and the rssCloud shapes depend on it (a port
 * is an `i4`, a urlList is an `array`).
 */
export type XmlRpcValue =
    | { type: 'string'; value: string }
    | { type: 'i4'; value: number }
    | { type: 'int'; value: number }
    | { type: 'boolean'; value: boolean }
    | { type: 'array'; value: XmlRpcValue[] }
    | { type: 'struct'; value: Record<string, XmlRpcValue> };

/** A `<string>` value. */
export function str(value: string): XmlRpcValue {
    return { type: 'string', value };
}

/** An `<i4>` value (32-bit integer). */
export function i4(value: number): XmlRpcValue {
    return { type: 'i4', value };
}

/** An `<int>` value (synonym of i4; kept distinct to preserve emitted tags). */
export function int(value: number): XmlRpcValue {
    return { type: 'int', value };
}

/** A `<boolean>` value, emitted as `1`/`0`. */
export function bool(value: boolean): XmlRpcValue {
    return { type: 'boolean', value };
}

/** An `<array>` of values. */
export function array(value: XmlRpcValue[]): XmlRpcValue {
    return { type: 'array', value };
}

/** A `<struct>` keyed by member name. */
export function struct(value: Record<string, XmlRpcValue>): XmlRpcValue {
    return { type: 'struct', value };
}

/** Convert a typed value into the xml2js node shape for a `<value>` body. */
function toNode(v: XmlRpcValue): unknown {
    switch (v.type) {
        case 'string':
            return { string: v.value };
        case 'i4':
            return { i4: v.value };
        case 'int':
            return { int: v.value };
        case 'boolean':
            return { boolean: v.value ? 1 : 0 };
        case 'array':
            return { array: { data: { value: v.value.map(toNode) } } };
        case 'struct':
            return {
                struct: {
                    member: Object.entries(v.value).map(([name, member]) => ({
                        name,
                        value: toNode(member)
                    }))
                }
            };
    }
}

/** Build an XML-RPC `methodCall` document for `methodName` with positional params. */
export function buildMethodCall(
    methodName: string,
    params: XmlRpcValue[]
): string {
    const methodCall: Record<string, unknown> = { methodName };
    if (params.length > 0) {
        methodCall['params'] = {
            param: params.map(p => ({ value: toNode(p) }))
        };
    }
    return new Builder().buildObject({ methodCall });
}

/** Build an XML-RPC `methodResponse` carrying a single value. */
export function buildMethodResponse(value: XmlRpcValue): string {
    return new Builder().buildObject({
        methodResponse: { params: { param: { value: toNode(value) } } }
    });
}

/** Build an XML-RPC fault `methodResponse` with the standard struct. */
export function buildFault(code: number, faultString: string): string {
    return new Builder().buildObject({
        methodResponse: {
            fault: {
                value: toNode(
                    struct({
                        faultCode: int(code),
                        faultString: str(faultString)
                    })
                )
            }
        }
    });
}
