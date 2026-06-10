import { createHash } from 'node:crypto';
import type {
    PingRequest,
    PingResponse,
    SubscribeRequest,
    SubscribeResponse,
    SubscribeResult,
    UnsubscribeRequest,
    UnsubscribeResponse
} from './dto.js';
import { RssCloudError } from '../errors.js';
import { createEventBus } from '../events.js';
import { createDefaultFeedParser } from '../feed/feed-parser.js';
import type { ResourcePayload, ProtocolPlugin } from './plugin.js';
import type { Protocol } from './protocol.js';
import type { Resource } from './resource.js';
import type { FeedStat, MaintenanceResult, Stats } from './stats.js';
import type { Subscription } from './subscription.js';
import type {
    RssCloudCore,
    RssCloudCoreOptions
} from './core.js';

const EPOCH = new Date(0);

function md5(value: string): string {
    return createHash('md5').update(value).digest('hex');
}

/**
 * The protocol-neutral rssCloud engine. Owns change detection and fan-out and
 * exposes the housekeeping jobs the host schedules; transports are supplied as
 * plugins and persistence as a {@link RssCloudCoreOptions.store}.
 */
export function createRssCloudCore(
    options: RssCloudCoreOptions
): RssCloudCore {
    const { store, plugins, config } = options;
    const events = options.events ?? createEventBus();
    const doFetch = options.fetch ?? fetch;
    const now = options.now ?? (() => new Date());
    const feedParser =
        options.feedParser ??
        createDefaultFeedParser({ maxResourceSize: config.maxResourceSize });

    const pluginByProtocol = new Map<Protocol, ProtocolPlugin>();
    for (const plugin of plugins) {
        for (const protocol of plugin.protocols) {
            pluginByProtocol.set(protocol, plugin);
        }
        void plugin.init?.();
    }

    function expiryFrom(base: Date): Date {
        return new Date(base.getTime() + config.ctSecsResourceExpire * 1000);
    }

    async function fetchWithTimeout(
        url: string,
        init: RequestInit
    ): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            config.requestTimeoutMs
        );
        try {
            return await doFetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }
    }

    function newResource(url: string): Resource {
        return {
            url,
            lastHash: '',
            lastSize: 0,
            ctChecks: 0,
            whenLastCheck: EPOCH,
            ctUpdates: 0,
            whenLastUpdate: EPOCH
        };
    }

    function ensurePingAllowed(resource: Resource): void {
        const minSecs = config.minSecsBetweenPings;
        if (minSecs <= 0) {
            return;
        }
        const elapsedSecs =
            (now().getTime() - resource.whenLastCheck.getTime()) / 1000;
        if (elapsedSecs < minSecs) {
            throw new RssCloudError(
                'PING_TOO_RECENT',
                `A ping for this resource was received less than ${minSecs} seconds ago.`
            );
        }
    }

    interface ChangeResult {
        changed: boolean;
        payload: ResourcePayload;
    }

    async function detectChange(
        resource: Resource,
        resourceUrl: string
    ): Promise<ChangeResult> {
        let body = '';
        let contentType: string | null = null;
        let ok = false;

        try {
            const res = await fetchWithTimeout(resourceUrl, { method: 'GET' });
            ok = res.ok;
            if (ok) {
                body = await res.text();
                contentType = res.headers.get('content-type');
            }
        } catch {
            ok = false;
        }

        resource.ctChecks += 1;
        resource.whenLastCheck = now();

        if (!ok) {
            throw new RssCloudError(
                'RESOURCE_READ_FAILED',
                `The resource at ${resourceUrl} could not be read.`
            );
        }

        const hash = md5(body);
        const changed =
            resource.lastHash !== hash || resource.lastSize !== body.length;
        resource.lastHash = hash;
        resource.lastSize = body.length;

        if (body && (changed || resource.feed === undefined)) {
            const meta = await feedParser.parse(body);
            if (meta) {
                resource.feed = meta;
            }
        }

        return { changed, payload: { body, contentType } };
    }

    function isActive(subscription: Subscription): boolean {
        if (subscription.whenExpires.getTime() <= now().getTime()) {
            return false;
        }
        if (subscription.ctConsecutiveErrors >= config.maxConsecutiveErrors) {
            return false;
        }
        return true;
    }

    async function deliverTo(
        resourceUrl: string,
        resource: Resource,
        payload: ResourcePayload,
        subscription: Subscription
    ): Promise<void> {
        const plugin = pluginByProtocol.get(subscription.protocol);
        const result = plugin
            ? await plugin.deliver({ subscription, resource, payload })
            : {
                  ok: false,
                  error: new Error(
                      `No plugin registered for protocol "${subscription.protocol}".`
                  )
              };

        if (result.ok) {
            subscription.ctUpdates += 1;
            subscription.ctConsecutiveErrors = 0;
            subscription.whenLastUpdate = now();
            events.emit('notify', {
                callbackUrl: subscription.url,
                protocol: subscription.protocol,
                resourceUrl
            });
            return;
        }

        subscription.ctErrors += 1;
        subscription.ctConsecutiveErrors += 1;
        subscription.whenLastError = now();
        events.emit('notifyFailed', {
            callbackUrl: subscription.url,
            protocol: subscription.protocol,
            resourceUrl,
            error: result.error?.message ?? 'Notification failed'
        });
    }

    async function fanOut(
        resourceUrl: string,
        resource: Resource,
        payload: ResourcePayload
    ): Promise<void> {
        const subscriptions = await store.getSubscriptions(resourceUrl);
        const active = subscriptions.filter(isActive);

        events.emit('resourceChanged', {
            resourceUrl,
            subscriberCount: active.length
        });

        await Promise.all(
            active.map(subscription =>
                deliverTo(resourceUrl, resource, payload, subscription)
            )
        );

        await store.putSubscriptions(resourceUrl, subscriptions);
    }

    async function ping(req: PingRequest): Promise<PingResponse> {
        const start = now();
        const resource =
            (await store.getResource(req.resourceUrl)) ??
            newResource(req.resourceUrl);

        ensurePingAllowed(resource);

        const { changed, payload } = await detectChange(
            resource,
            req.resourceUrl
        );

        if (changed) {
            resource.ctUpdates += 1;
            resource.whenLastUpdate = now();
            await fanOut(req.resourceUrl, resource, payload);
        }

        await store.putResource(req.resourceUrl, resource);

        events.emit('ping', {
            resourceUrl: req.resourceUrl,
            changed,
            hash: resource.lastHash,
            size: resource.lastSize,
            durationMs: now().getTime() - start.getTime()
        });

        return { success: true, message: 'Thanks for the ping.' };
    }

    function buildSubscription(req: SubscribeRequest): Subscription {
        const subscription: Subscription = {
            url: req.callbackUrl,
            protocol: req.protocol,
            ctUpdates: 0,
            ctErrors: 0,
            ctConsecutiveErrors: 0,
            whenCreated: now(),
            whenLastUpdate: null,
            whenLastError: null,
            whenExpires: expiryFrom(now())
        };
        if (req.notifyProcedure !== undefined) {
            subscription.notifyProcedure = req.notifyProcedure;
        }
        if (req.details !== undefined) {
            subscription.details = req.details;
        }
        return subscription;
    }

    function upsertSubscription(
        subscriptions: Subscription[],
        req: SubscribeRequest
    ): Subscription {
        const existing = subscriptions.find(s => s.url === req.callbackUrl);
        if (existing === undefined) {
            const created = buildSubscription(req);
            subscriptions.push(created);
            return created;
        }
        existing.protocol = req.protocol;
        if (req.notifyProcedure !== undefined) {
            existing.notifyProcedure = req.notifyProcedure;
        }
        if (req.details !== undefined) {
            existing.details = req.details;
        }
        return existing;
    }

    async function subscribeOne(
        plugin: ProtocolPlugin,
        req: SubscribeRequest,
        resourceUrl: string,
        diffDomain: boolean
    ): Promise<SubscribeResult> {
        try {
            await ping({ resourceUrl });
        } catch (err) {
            if (
                !(err instanceof RssCloudError) ||
                err.code !== 'PING_TOO_RECENT'
            ) {
                return {
                    resourceUrl,
                    success: false,
                    errorCode: 'RESOURCE_READ_FAILED'
                };
            }
        }

        const subscriptions = (
            await store.getSubscriptions(resourceUrl)
        ).slice();
        const subscription = upsertSubscription(subscriptions, req);

        try {
            await plugin.verify({ subscription, resourceUrl, diffDomain });
        } catch {
            return {
                resourceUrl,
                success: false,
                errorCode: 'SUBSCRIPTION_VERIFICATION_FAILED'
            };
        }

        subscription.ctUpdates += 1;
        subscription.ctConsecutiveErrors = 0;
        subscription.whenLastUpdate = now();
        subscription.whenExpires = expiryFrom(now());
        await store.putSubscriptions(resourceUrl, subscriptions);

        events.emit('subscribe', {
            callbackUrl: req.callbackUrl,
            protocol: req.protocol,
            resourceUrl,
            diffDomain
        });

        return { resourceUrl, success: true };
    }

    async function subscribe(
        req: SubscribeRequest
    ): Promise<SubscribeResponse> {
        if (req.resourceUrls.length === 0) {
            throw new RssCloudError(
                'NO_RESOURCES',
                'No resources were supplied to subscribe to.'
            );
        }

        const plugin = pluginByProtocol.get(req.protocol);
        if (plugin === undefined) {
            throw new RssCloudError(
                'UNSUPPORTED_PROTOCOL',
                `No plugin is registered for protocol "${req.protocol}".`
            );
        }

        const diffDomain = req.diffDomain ?? false;
        const results = await Promise.all(
            req.resourceUrls.map(resourceUrl =>
                subscribeOne(plugin, req, resourceUrl, diffDomain)
            )
        );

        const succeeded = results.some(result => result.success);
        return {
            success: succeeded,
            message: succeeded
                ? 'Subscription confirmed.'
                : 'Subscription could not be confirmed for any resource.',
            results
        };
    }

    async function unsubscribe(
        req: UnsubscribeRequest
    ): Promise<UnsubscribeResponse> {
        for (const resourceUrl of req.resourceUrls) {
            const subscriptions = await store.getSubscriptions(resourceUrl);
            const remaining = subscriptions.filter(
                s =>
                    !(
                        s.url === req.callbackUrl &&
                        s.protocol === req.protocol
                    )
            );
            if (remaining.length !== subscriptions.length) {
                await store.putSubscriptions(resourceUrl, remaining);
            }
        }

        return { success: true, message: 'Unsubscribed.' };
    }

    function windowCutoff(from: Date): Date {
        return new Date(
            from.getTime() - config.feedsChangedWindowDays * 86400 * 1000
        );
    }

    async function removeExpired(): Promise<MaintenanceResult> {
        const current = now();
        const cutoff = windowCutoff(current);
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
                    subscription.ctConsecutiveErrors >=
                    config.maxConsecutiveErrors;
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

    async function generateStats(): Promise<Stats> {
        const current = now();
        const cutoff = windowCutoff(current);
        const entries = await store.list();

        let feedsChangedLastWindow = 0;
        let totalActiveSubscriptions = 0;
        const hostnames = new Set<string>();
        const protocolBreakdown: Record<string, number> = {};
        const feedStats: FeedStat[] = [];

        for (const entry of entries) {
            const lastUpdate = entry.resource?.whenLastUpdate ?? null;
            const hasRealUpdate =
                lastUpdate !== null && lastUpdate.getTime() > 0;
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

    return {
        subscribe,
        unsubscribe,
        ping,
        events,
        removeExpired,
        generateStats
    };
}
