import { describe, it, expect } from 'vitest';
import { version } from './index.js';

describe('version', () => {
    it('exposes a semver string', () => {
        expect(version).toBe('0.0.0');
    });
});
