import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@rsscloud/client public API', () => {
    it('exports the rssCloud request builders', () => {
        expect(typeof api.buildPleaseNotifyCall).toBe('function');
        expect(typeof api.buildPingCall).toBe('function');
    });
});
