import type { RssCloudConfig } from '../config.js';
import type { Resource } from './resource.js';
import type { FeedStat, MaintenanceResult, Stats } from './stats.js';
import type { Store } from '../store/store.js';

/**
 * Housekeeping jobs the host schedules on an interval. They need only a
 * {@link Store}, the protocol {@link RssCloudConfig}, and a clock — no
 * transports or feed parsing — so they live apart from the core factory and
 * are exercised directly rather than through a fully-wired core.
 */

function windowCutoff(from: Date, windowDays: number): Date {
    return new Date(from.getTime() - windowDays * 86400 * 1000);
}

/** Drop expired/exhausted subscriptions and prune orphaned resources. */
export async function removeExpired(
    store: Store,
    config: RssCloudConfig,
    now: () => Date
): Promise<MaintenanceResult> {
    const current = now();
    const cutoff = windowCutoff(current, config.feedsChangedWindowDays);
    const entries = await store.list();

    let subscriptionsRemoved = 0;
    let feedsDeleted = 0;
    let orphanedResourcesRemoved = 0;

    const recentlyUpdated = (resource: Resource | null): boolean =>
        resource !== null &&
        resource.whenLastUpdate.getTime() > 0 &&
        resource.whenLastUpdate >= cutoff;

    for (const entry of entries) {
        if (entry.subscriptions.length === 0) {
            if (recentlyUpdated(entry.resource)) {
                continue;
            }
            await store.remove(entry.feedUrl);
            orphanedResourcesRemoved += 1;
            continue;
        }

        const valid = entry.subscriptions.filter(subscription => {
            const expired =
                subscription.whenExpires.getTime() <= current.getTime();
            const exhausted =
                subscription.ctConsecutiveErrors >= config.maxConsecutiveErrors;
            if (expired || exhausted) {
                subscriptionsRemoved += 1;
                return false;
            }
            return true;
        });

        if (valid.length === entry.subscriptions.length) {
            continue;
        }

        if (valid.length === 0) {
            if (recentlyUpdated(entry.resource)) {
                await store.putSubscriptions(entry.feedUrl, []);
            } else {
                await store.remove(entry.feedUrl);
                feedsDeleted += 1;
            }
        } else {
            await store.putSubscriptions(entry.feedUrl, valid);
        }
    }

    return {
        subscriptionsRemoved,
        feedsProcessed: entries.length,
        feedsDeleted,
        orphanedResourcesRemoved
    };
}

/** Aggregate a snapshot of server activity from the current store contents. */
export async function generateStats(
    store: Store,
    config: RssCloudConfig,
    now: () => Date
): Promise<Stats> {
    const current = now();
    const cutoff = windowCutoff(current, config.feedsChangedWindowDays);
    const entries = await store.list();

    let feedsChangedLastWindow = 0;
    let totalActiveSubscriptions = 0;
    const hostnames = new Set<string>();
    const protocolBreakdown: Record<string, number> = {};
    const feedStats: FeedStat[] = [];

    for (const entry of entries) {
        const lastUpdate = entry.resource?.whenLastUpdate ?? null;
        const hasRealUpdate = lastUpdate !== null && lastUpdate.getTime() > 0;
        if (hasRealUpdate && lastUpdate >= cutoff) {
            feedsChangedLastWindow += 1;
        }

        let activeCount = 0;
        for (const subscription of entry.subscriptions) {
            if (subscription.whenExpires.getTime() <= current.getTime()) {
                continue;
            }
            activeCount += 1;
            totalActiveSubscriptions += 1;
            try {
                hostnames.add(new URL(subscription.url).hostname);
            } catch {
                // ignore unparseable callback URLs
            }
            protocolBreakdown[subscription.protocol] =
                (protocolBreakdown[subscription.protocol] ?? 0) + 1;
        }

        if (activeCount > 0) {
            feedStats.push({
                url: entry.feedUrl,
                subscriberCount: activeCount,
                whenLastUpdate: hasRealUpdate
                    ? lastUpdate.toISOString()
                    : null,
                feedTitle: entry.resource?.feed?.title ?? null
            });
        }
    }

    const sorted = [...feedStats].sort(
        (a, b) => b.subscriberCount - a.subscriberCount
    );
    const cut = sorted.slice(0, 10);
    const last = cut[cut.length - 1];
    let topFeeds = cut;
    let moreFeeds: FeedStat[] = [];
    if (last !== undefined && sorted.length > 10) {
        topFeeds = sorted.filter(
            feed => feed.subscriberCount >= last.subscriberCount
        );
        moreFeeds = sorted.slice(topFeeds.length);
    }

    return {
        generatedAt: current.toISOString(),
        feedsChangedLastWindow,
        feedsWithSubscribers: feedStats.length,
        uniqueAggregators: hostnames.size,
        totalActiveSubscriptions,
        topFeeds,
        moreFeeds,
        protocolBreakdown
    };
}
