/**
 * Protocol-relevant tunables. Host concerns (port, domain, file paths, flush
 * intervals) are deliberately excluded — those belong to the adapter and the
 * Store implementation, not core.
 */
export interface RssCloudConfig {
    /** Minimum seconds between accepted pings for a resource (0 disables). */
    minSecsBetweenPings: number;
    /** Seconds a subscription lasts before it must be renewed. */
    ctSecsResourceExpire: number;
    /** Consecutive delivery failures tolerated before a sub is dropped. */
    maxConsecutiveErrors: number;
    /** Largest feed body (bytes) core will parse. */
    maxResourceSize: number;
    /** Per-request timeout (ms) for outbound fetches. */
    requestTimeoutMs: number;
    /** Window (days) used by stats and expiry housekeeping. */
    feedsChangedWindowDays: number;
}

/**
 * Signature of the helper core will provide to fill a partial config with
 * defaults. The composition root calls this once and shares the result with
 * both core and the plugins.
 */
export type ResolveConfig = (
    config?: Partial<RssCloudConfig>
) => RssCloudConfig;
