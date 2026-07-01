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
import {
    generateStats as runGenerateStats,
    removeExpired as runRemoveExpired
} from './maintenance.js';
import type {
    ResourcePayload,
    ProtocolPlugin,
    VerifyContext
} from './plugin.js';
import type { Protocol } from './protocol.js';
import type { Resource } from './resource.js';
import type { Subscription } from './subscription.js';
import { createInProcessVerificationScheduler } from './verification-scheduler.js';
import type { FeedEntry, Store } from '../store/store.js';
import type { RssCloudCore, RssCloudCoreOptions } from './core.js';

const EPOCH = new Date(0);

function md5(value: string): string {
    return createHash('md5').update(value).digest('hex');
}

/** Teardown a Store may optionally implement (e.g. a file-backed store). */
interface ClosableStore {
    close(): Promise<void>;
}

function isClosable(store: Store): store is Store & ClosableStore {
    return typeof (store as Partial<ClosableStore>).close === 'function';
}

/**
 * The protocol-neutral rssCloud engine. Owns change detection and fan-out and
 * exposes the housekeeping jobs the host schedules; transports are supplied as
 * plugins and persistence as a {@link RssCloudCoreOptions.store}.
 */
export function createRssCloudCore(options: RssCloudCoreOptions): RssCloudCore {
    const { plugins, config } = options;
    // Construction may be async (e.g. a file- or DB-backed store): normalize the
    // injected store to a resolve-once promise and front it with a Store facade
    // whose every call awaits that one-time load. The host gets a concrete `core`
    // synchronously; the first operations simply await initialization.
    const storeReady = Promise.resolve(options.store);
    const store: Store = {
        getResource: feedUrl => storeReady.then(s => s.getResource(feedUrl)),
        putResource: (feedUrl, resource) =>
            storeReady.then(s => s.putResource(feedUrl, resource)),
        getSubscriptions: feedUrl =>
            storeReady.then(s => s.getSubscriptions(feedUrl)),
        putSubscriptions: (feedUrl, subscriptions) =>
            storeReady.then(s => s.putSubscriptions(feedUrl, subscriptions)),
        list: () => storeReady.then(s => s.list()),
        remove: feedUrl => storeReady.then(s => s.remove(feedUrl))
    };
    const events = options.events ?? createEventBus();
    const doFetch = options.fetch ?? fetch;
    const now = options.now ?? (() => new Date());
    const scheduler =
        options.scheduler ??
        createInProcessVerificationScheduler({
            onError: error =>
                events.emit('error', {
                    scope: 'websub-verification',
                    error:
                        error instanceof Error
                            ? error
                            : new Error(String(error))
                })
        });
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

    /**
     * Resolve a WebSub lease: the requested `hub.lease_seconds` clamped to the
     * configured `[min, max]` bounds, or the default when none was requested.
     */
    function clampLease(requested: unknown): number {
        if (typeof requested !== 'number') {
            return config.webSubLeaseDefaultSecs;
        }
        return Math.min(
            config.webSubLeaseMaxSecs,
            Math.max(config.webSubLeaseMinSecs, requested)
        );
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
            // The injected fetch carries its own outbound timeout (see the host's
            // createSafeFetch wiring); the engine just issues the request.
            const res = await doFetch(resourceUrl, { method: 'GET' });
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

        // WebSub subscriptions carry a lease: the chosen value is recorded in
        // details, echoed on the verification GET, and maps to whenExpires.
        const leaseSeconds =
            req.protocol === 'websub'
                ? clampLease(req.details?.['leaseSeconds'])
                : undefined;

        const verifyContext: VerifyContext = {
            subscription,
            resourceUrl,
            diffDomain
        };
        if (leaseSeconds !== undefined) {
            subscription.details = {
                ...(subscription.details ?? {}),
                leaseSeconds
            };
            verifyContext.leaseSeconds = leaseSeconds;
        }

        try {
            await plugin.verify(verifyContext);
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
        subscription.whenExpires =
            leaseSeconds !== undefined
                ? new Date(now().getTime() + leaseSeconds * 1000)
                : expiryFrom(now());
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

    function acceptSubscription(req: SubscribeRequest): void {
        // A new caller of the unchanged `subscribe`: the scheduler runs the
        // verify→persist out of band so the front door can answer `202` first.
        // `subscribe` persists only after `verify` succeeds and records nothing
        // on a refusal, so no extra failure handling is needed here — only a
        // genuine exception reaches the scheduler's onError.
        scheduler.schedule(async () => {
            await subscribe(req);
        });
    }

    function acceptUnsubscription(req: UnsubscribeRequest): void {
        // The unsubscribe counterpart to acceptSubscription: the scheduler runs
        // the intent-verification challenge GET out of band so the front door
        // answers 202 first, removing the subscription only once confirmed.
        scheduler.schedule(async () => {
            await verifiedUnsubscribe(req);
        });
    }

    async function verifiedUnsubscribe(req: UnsubscribeRequest): Promise<void> {
        const plugin = pluginByProtocol.get(req.protocol);
        if (plugin === undefined) {
            throw new RssCloudError(
                'UNSUPPORTED_PROTOCOL',
                `No plugin is registered for protocol "${req.protocol}".`
            );
        }

        for (const resourceUrl of req.resourceUrls) {
            const subscriptions = await store.getSubscriptions(resourceUrl);
            const existing = subscriptions.find(
                s => s.url === req.callbackUrl && s.protocol === req.protocol
            );
            if (existing === undefined) {
                continue;
            }
            try {
                await plugin.verify({
                    subscription: existing,
                    resourceUrl,
                    diffDomain: false,
                    mode: 'unsubscribe'
                });
            } catch {
                // Intent not confirmed — leave the subscription in place.
                return;
            }
        }

        await unsubscribe(req);
    }

    function acceptPublish(req: PingRequest): void {
        // A well-formed WebSub publish is acknowledged immediately (202) and the
        // topic re-fetched out of band, reusing ping's fetch→payload→fanOut. Per
        // the spec the publisher isn't told the fetch outcome, so a failure is
        // surfaced on the error event rather than thrown.
        void ping(req).catch(error =>
            events.emit('error', {
                scope: 'websub-publish',
                error: error instanceof Error ? error : new Error(String(error))
            })
        );
    }

    async function unsubscribe(
        req: UnsubscribeRequest
    ): Promise<UnsubscribeResponse> {
        for (const resourceUrl of req.resourceUrls) {
            const subscriptions = await store.getSubscriptions(resourceUrl);
            const remaining = subscriptions.filter(
                s => !(s.url === req.callbackUrl && s.protocol === req.protocol)
            );
            if (remaining.length !== subscriptions.length) {
                await store.putSubscriptions(resourceUrl, remaining);
            }
        }

        return { success: true, message: 'Unsubscribed.' };
    }

    async function close(): Promise<void> {
        const resolved = await storeReady;
        if (isClosable(resolved)) {
            await resolved.close();
        }
    }

    function listFeeds(): Promise<FeedEntry[]> {
        return store.list();
    }

    function seedResource(feedUrl: string, resource: Resource): Promise<void> {
        return store.putResource(feedUrl, resource);
    }

    function seedSubscriptions(
        feedUrl: string,
        subscriptions: Subscription[]
    ): Promise<void> {
        return store.putSubscriptions(feedUrl, subscriptions);
    }

    async function clearFeeds(): Promise<void> {
        for (const { feedUrl } of await store.list()) {
            await store.remove(feedUrl);
        }
    }

    return {
        subscribe,
        acceptSubscription,
        acceptUnsubscription,
        acceptPublish,
        unsubscribe,
        ping,
        events,
        listFeeds,
        seedResource,
        seedSubscriptions,
        clearFeeds,
        close,
        removeExpired: () => runRemoveExpired(store, config, now),
        generateStats: () => runGenerateStats(store, config, now)
    };
}
