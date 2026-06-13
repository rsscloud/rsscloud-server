import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './fetch-with-timeout.js';

afterEach(() => {
    vi.useRealTimers();
});

describe('fetchWithTimeout', () => {
    it('forwards the request to doFetch with an abort signal and returns its response', async () => {
        const response = new Response('ok');
        let signal: AbortSignal | undefined;
        const doFetch = vi.fn(async (_url: string, init: RequestInit) => {
            signal = init.signal as AbortSignal;
            return response;
        });

        const res = await fetchWithTimeout(
            doFetch as unknown as typeof fetch,
            1000,
            'https://target.example/notify',
            { method: 'POST' }
        );

        expect(res).toBe(response);
        expect(doFetch).toHaveBeenCalledWith(
            'https://target.example/notify',
            expect.objectContaining({
                method: 'POST',
                signal: expect.any(AbortSignal)
            })
        );
        expect(signal?.aborted).toBe(false);
    });

    it('aborts the request once the timeout elapses', async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        const doFetch = vi.fn(
            (_url: string, init: RequestInit) => {
                signal = init.signal as AbortSignal;
                return new Promise<Response>(() => {});
            }
        );

        void fetchWithTimeout(
            doFetch as unknown as typeof fetch,
            1000,
            'https://target.example/notify',
            {}
        );

        expect(signal?.aborted).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(signal?.aborted).toBe(true);
    });

    it('clears the timer once settled, so a completed request is never aborted', async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        const doFetch = vi.fn(async (_url: string, init: RequestInit) => {
            signal = init.signal as AbortSignal;
            return new Response('ok');
        });

        await fetchWithTimeout(
            doFetch as unknown as typeof fetch,
            1000,
            'https://target.example/notify',
            {}
        );

        vi.advanceTimersByTime(5000);
        expect(signal?.aborted).toBe(false);
    });
});
