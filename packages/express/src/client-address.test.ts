import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { resolveClientAddress } from './client-address.js';

function fakeReq(opts: {
    forwarded?: string | string[];
    remote?: string;
}): Request {
    const headers =
        opts.forwarded === undefined ? {} : { 'x-forwarded-for': opts.forwarded };
    return {
        headers,
        socket: { remoteAddress: opts.remote }
    } as unknown as Request;
}

describe('resolveClientAddress', () => {
    it('prefers the X-Forwarded-For header when present', () => {
        const address = resolveClientAddress(
            fakeReq({ forwarded: '203.0.113.5', remote: '10.0.0.1' })
        );
        expect(address).toBe('203.0.113.5');
    });

    it('falls back to the socket remote address', () => {
        const address = resolveClientAddress(fakeReq({ remote: '10.0.0.1' }));
        expect(address).toBe('10.0.0.1');
    });

    it('ignores a list-valued X-Forwarded-For header', () => {
        const address = resolveClientAddress(
            fakeReq({ forwarded: ['203.0.113.5', '198.51.100.1'], remote: '10.0.0.1' })
        );
        expect(address).toBe('10.0.0.1');
    });

    it('returns an empty string when neither source is available', () => {
        const address = resolveClientAddress(fakeReq({}));
        expect(address).toBe('');
    });
});
