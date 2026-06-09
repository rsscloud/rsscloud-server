/** One feed's line in the stats report. */
export interface FeedStat {
    url: string;
    subscriberCount: number;
    /** ISO 8601, or `null` if the feed has never been seen to change. */
    whenLastUpdate: string | null;
    feedTitle: string | null;
}

/** Aggregate snapshot of server activity. */
export interface Stats {
    /** ISO 8601 generation time, or `null` before the first run. */
    generatedAt: string | null;
    feedsChangedLastWindow: number;
    feedsWithSubscribers: number;
    /** Distinct subscriber hostnames. */
    uniqueAggregators: number;
    totalActiveSubscriptions: number;
    /** Most-subscribed feeds (ties at the boundary included). */
    topFeeds: FeedStat[];
    /** The remainder, below the top cut. */
    moreFeeds: FeedStat[];
    /** Active subscription counts keyed by protocol. */
    protocolBreakdown: Record<string, number>;
}

/** Summary returned by an expiry/cleanup pass. */
export interface MaintenanceResult {
    subscriptionsRemoved: number;
    feedsProcessed: number;
    feedsDeleted: number;
    orphanedResourcesRemoved: number;
}
