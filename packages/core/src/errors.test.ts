import { describe, expect, it } from 'vitest';
import { RssCloudError } from './errors.js';

describe('RssCloudError', () => {
    it('carries a machine-readable code alongside the message', () => {
        const err = new RssCloudError('PING_TOO_RECENT', 'too soon');

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(RssCloudError);
        expect(err.code).toBe('PING_TOO_RECENT');
        expect(err.message).toBe('too soon');
        expect(err.name).toBe('RssCloudError');
    });
});
