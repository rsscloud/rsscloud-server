import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@rsscloud/xml-rpc public API', () => {
    it('exports the methodCall decoder', () => {
        expect(typeof api.parseMethodCall).toBe('function');
    });
});
