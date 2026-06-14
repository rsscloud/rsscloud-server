import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, resolveConfig } from './config.js';

describe('resolveConfig', () => {
    it('returns the documented defaults when given nothing', () => {
        expect(resolveConfig()).toEqual({
            minSecsBetweenPings: 0,
            ctSecsResourceExpire: 90000,
            maxConsecutiveErrors: 3,
            maxResourceSize: 256000,
            requestTimeoutMs: 4000,
            feedsChangedWindowDays: 7,
            webSubLeaseDefaultSecs: 86400,
            webSubLeaseMinSecs: 300,
            webSubLeaseMaxSecs: 864000
        });
    });

    it('overrides only the provided keys', () => {
        const resolved = resolveConfig({ maxConsecutiveErrors: 5 });
        expect(resolved.maxConsecutiveErrors).toBe(5);
        expect(resolved.requestTimeoutMs).toBe(DEFAULT_CONFIG.requestTimeoutMs);
    });

    it('preserves explicit zero values', () => {
        expect(
            resolveConfig({ ctSecsResourceExpire: 0 }).ctSecsResourceExpire
        ).toBe(0);
    });
});
