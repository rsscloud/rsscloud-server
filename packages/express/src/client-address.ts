import type { Request } from 'express';

/**
 * Resolve the caller's address the way the rssCloud server always has: trust an
 * `X-Forwarded-For` header when present, otherwise fall back to the socket's
 * remote address. The REST and XML-RPC dispatchers fold this into a callback URL
 * when a subscriber omits an explicit `domain`.
 */
export function resolveClientAddress(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    const candidate = typeof forwarded === 'string' ? forwarded : '';
    return candidate || req.socket.remoteAddress || '';
}
