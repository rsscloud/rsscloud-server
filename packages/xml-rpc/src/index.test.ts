import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@rsscloud/xml-rpc public API', () => {
    it('exports the decoder and the builders', () => {
        expect(typeof api.parseMethodCall).toBe('function');
        expect(typeof api.buildMethodCall).toBe('function');
        expect(typeof api.buildMethodResponse).toBe('function');
        expect(typeof api.buildFault).toBe('function');
    });

    it('exports the value constructors', () => {
        for (const name of ['str', 'i4', 'int', 'bool', 'array', 'struct']) {
            expect(typeof api[name as keyof typeof api]).toBe('function');
        }
    });
});
