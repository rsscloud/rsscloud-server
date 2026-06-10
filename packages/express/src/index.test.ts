import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@rsscloud/express public API', () => {
    it('exports the three endpoint middleware factories', () => {
        expect(typeof api.pleaseNotify).toBe('function');
        expect(typeof api.ping).toBe('function');
        expect(typeof api.rpc2).toBe('function');
    });
});
