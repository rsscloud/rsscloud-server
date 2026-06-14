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
    /** WebSub lease (secs) granted when a subscriber omits `hub.lease_seconds`. */
    webSubLeaseDefaultSecs: number;
    /** Lower bound (secs) a requested WebSub lease is clamped up to. */
    webSubLeaseMinSecs: number;
    /** Upper bound (secs) a requested WebSub lease is clamped down to. */
    webSubLeaseMaxSecs: number;
}

/**
 * Signature of the helper core will provide to fill a partial config with
 * defaults. The composition root calls this once and shares the result with
 * both core and the plugins.
 */
export type ResolveConfig = (
    config?: Partial<RssCloudConfig>
) => RssCloudConfig;

/** Built-in defaults, matching the historical @rsscloud/server values. */
export const DEFAULT_CONFIG: RssCloudConfig = {
    minSecsBetweenPings: 0,
    ctSecsResourceExpire: 90000,
    maxConsecutiveErrors: 3,
    maxResourceSize: 256000,
    requestTimeoutMs: 4000,
    feedsChangedWindowDays: 7,
    webSubLeaseDefaultSecs: 86400,
    webSubLeaseMinSecs: 300,
    webSubLeaseMaxSecs: 864000
};

/** Fill a partial config with {@link DEFAULT_CONFIG} values. */
export const resolveConfig: ResolveConfig = config => ({
    ...DEFAULT_CONFIG,
    ...config
});
