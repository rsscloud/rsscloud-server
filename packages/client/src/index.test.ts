import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@rsscloud/client public API', () => {
    it('exports the client factory', () => {
        expect(typeof api.createRssCloudClient).toBe('function');
    });

    it('exports the rssCloud request builders', () => {
        expect(typeof api.buildPleaseNotifyCall).toBe('function');
        expect(typeof api.buildPingCall).toBe('function');
    });

    it('exports the notification receive helpers', () => {
        expect(typeof api.parseHttpPostNotify).toBe('function');
        expect(typeof api.parseXmlRpcNotify).toBe('function');
        expect(typeof api.buildNotifyResponse).toBe('function');
    });

    it('exports the cloud feed renderer', () => {
        expect(typeof api.renderCloudFeed).toBe('function');
    });
});
