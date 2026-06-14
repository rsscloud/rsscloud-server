/**
 * The seam behind WebSub's async-`202` accept. After the hub validates a request
 * and answers `202`, the verify→persist work runs out of band through a
 * scheduler. The default is in-process and best-effort (one attempt; a rejected
 * task is surfaced, not retried; a restart drops anything in flight). A future
 * persisted queue + retry can satisfy this same interface without touching the
 * dispatcher, the plugin's `verify`, or the express factory. See ADR-0002.
 */
export interface VerificationScheduler {
    /**
     * Enqueue a verify→persist task. Must return immediately without awaiting the
     * task, and must not throw — a rejected task is the scheduler's to absorb.
     */
    schedule(task: () => Promise<void>): void;
}

/** Construction-time dependencies for the in-process scheduler. */
export interface InProcessVerificationSchedulerOptions {
    /** Surfaces a task that rejected (the composition root logs/emits it). */
    onError: (error: unknown) => void;
}

/**
 * The default {@link VerificationScheduler}: runs each task on the microtask
 * queue so the caller's `202` is sent first, and routes a rejection to
 * `onError` so it never becomes an unhandled rejection.
 */
export function createInProcessVerificationScheduler(
    options: InProcessVerificationSchedulerOptions
): VerificationScheduler {
    return {
        schedule(task) {
            queueMicrotask(() => {
                void task().catch(options.onError);
            });
        }
    };
}
