import type { RssCloudConfig } from '../config.js';
import type {
    PingRequest,
    PingResponse,
    SubscribeRequest,
    SubscribeResponse,
    UnsubscribeRequest,
    UnsubscribeResponse
} from './dto.js';
import type { EventBus } from '../events.js';
import type { FeedParser } from '../feed/feed.js';
import type { ProtocolPlugin } from './plugin.js';
import type { MaintenanceResult, Stats } from './stats.js';
import type { Resource } from './resource.js';
import type { Subscription } from './subscription.js';
import type { VerificationScheduler } from './verification-scheduler.js';
import type { FeedEntry, Store } from '../store/store.js';

/**
 * Everything core needs, assembled by the host's composition root. The shared
 * dependencies (`config`, `events`, `fetch`, clock) are created there and
 * injected into both the plugins and core, so there is a single source of truth
 * for each.
 */
export interface RssCloudCoreOptions {
    /**
     * Persistence port. May be a concrete {@link Store} or a `Promise` of one,
     * letting backends that need async init (file, database) be passed straight
     * in — core resolves it once and defers operations until it is ready.
     */
    store: Store | Promise<Store>;
    /** The plugin stack, already constructed and ready to use. */
    plugins: ProtocolPlugin[];
    /** Fully-resolved config (see `ResolveConfig` for defaults). */
    config: RssCloudConfig;
    /** Shared event bus; core creates a default if omitted. */
    events?: EventBus;
    /** Injectable fetch (tests, edge runtimes); defaults to global fetch. */
    fetch?: typeof fetch;
    /** Injectable clock; defaults to `() => new Date()`. */
    now?: () => Date;
    /** Feed metadata parser; defaults to core's built-in. */
    feedParser?: FeedParser;
    /**
     * Runs WebSub's out-of-band verify→persist work after an async-`202` accept.
     * Defaults to an in-process best-effort scheduler (see ADR-0002); a host may
     * inject a persisted-queue implementation.
     */
    scheduler?: VerificationScheduler;
}

/**
 * The protocol-neutral engine an adapter drives. It accepts the use-case DTOs,
 * owns change detection and fan-out, and exposes the housekeeping jobs the host
 * schedules.
 */
export interface RssCloudCore {
    /** Establish or renew subscriptions. */
    subscribe(req: SubscribeRequest): Promise<SubscribeResponse>;
    /**
     * Accept a subscription for async (WebSub-style) intent verification: returns
     * immediately and schedules the verify→persist work via the
     * {@link RssCloudCoreOptions.scheduler}. A successful verify persists the
     * subscription; a failed one persists nothing. A new caller of
     * {@link subscribe} — the synchronous rssCloud path is unchanged.
     */
    acceptSubscription(req: SubscribeRequest): void;
    /** Cancel subscriptions. */
    unsubscribe(req: UnsubscribeRequest): Promise<UnsubscribeResponse>;
    /**
     * Handle a change signal: re-fetch the resource, detect a change, and on a
     * change fan out to every subscriber via its protocol's plugin.
     */
    ping(req: PingRequest): Promise<PingResponse>;

    /** The observability bus (same instance passed in options, if any). */
    readonly events: EventBus;

    /**
     * Read-only snapshot of every tracked feed — the host's seam for the
     * raw-data views (`/subscriptions.json`, OPML export) without reaching into
     * the store. Concentrates all state access in core; the {@link Store} stays
     * private to the engine.
     */
    listFeeds(): Promise<FeedEntry[]>;

    /**
     * Seed a feed's resource state directly. The narrow write seam the host's
     * test API drives to stage fixtures; production paths reach state only
     * through {@link subscribe}/{@link ping}.
     */
    seedResource(feedUrl: string, resource: Resource): Promise<void>;

    /** Seed a feed's subscriber list directly (see {@link seedResource}). */
    seedSubscriptions(
        feedUrl: string,
        subscriptions: Subscription[]
    ): Promise<void>;

    /** Drop every tracked feed — the test API's reset between fixtures. */
    clearFeeds(): Promise<void>;

    /**
     * Await async store construction and tear the store down (flush + close).
     * A no-op for stores without a `close` lifecycle. Call on host shutdown.
     */
    close(): Promise<void>;

    /** Drop expired/errored subscriptions and prune empty feeds. */
    removeExpired(): Promise<MaintenanceResult>;
    /** Compute the activity snapshot. */
    generateStats(): Promise<Stats>;
}

/** Signature of the core factory the implementation step will provide. */
export type CreateRssCloudCore = (
    options: RssCloudCoreOptions
) => RssCloudCore;
