/**
 * Delivery transport stored on a Subscription. Selects which plugin performs
 * the outbound notification at fan-out time.
 *
 * The four built-ins cover today's server; the open `(string & {})` arm keeps
 * the type extensible so a plugin can introduce a new protocol value without a
 * core change, while preserving autocomplete for the built-ins.
 */
export type BuiltInProtocol =
    | 'http-post'
    | 'https-post'
    | 'xml-rpc'
    | 'websub';

export type Protocol = BuiltInProtocol | (string & {});
