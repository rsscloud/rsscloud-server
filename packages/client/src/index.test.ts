import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@rsscloud/client public API', () => {
    it('exposes a version', () => {
        expect(typeof api.version).toBe('string');
    });
});
