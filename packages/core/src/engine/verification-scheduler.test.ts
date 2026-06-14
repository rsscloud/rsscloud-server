import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInProcessVerificationScheduler } from './verification-scheduler.js';

afterEach(() => {
    vi.useRealTimers();
});

describe('createInProcessVerificationScheduler', () => {
    it('runs the scheduled task out of band, after schedule() returns', async () => {
        const order: string[] = [];
        const scheduler = createInProcessVerificationScheduler({
            onError: () => undefined
        });

        scheduler.schedule(async () => {
            order.push('task');
        });
        order.push('after-schedule');

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(order).toEqual(['after-schedule', 'task']);
    });

    it('routes a rejected task to onError instead of letting it go unhandled', async () => {
        const seen: unknown[] = [];
        const scheduler = createInProcessVerificationScheduler({
            onError: error => seen.push(error)
        });

        const boom = new Error('boom');
        scheduler.schedule(async () => {
            throw boom;
        });

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(seen).toEqual([boom]);
    });
});
