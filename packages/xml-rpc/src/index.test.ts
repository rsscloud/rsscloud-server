import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@rsscloud/xml-rpc public API', () => {
    it('exposes a version', () => {
        expect(typeof api.version).toBe('string');
    });
});
