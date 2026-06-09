import type { RssCloudConfig } from './config.js';
import type {
    PingRequest,
    PingResponse,
    SubscribeRequest,
    SubscribeResponse,
    UnsubscribeRequest,
    UnsubscribeResponse
} from './dto.js';
import type { EventBus } from './events.js';
import type { FeedParser } from './feed.js';
import type { ProtocolPlugin } from './plugin.js';
import type { MaintenanceResult, Stats } from './stats.js';
import type { Store } from './store.js';

/**
 * Everything core needs, assembled by the host's composition root. The shared
 * dependencies (`config`, `events`, `fetch`, clock) are created there and
 * injected into both the plugins and core, so there is a single source of truth
 * for each.
 */
export interface RssCloudCoreOptions {
    store: Store;
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
}

/**
 * The protocol-neutral engine an adapter drives. It accepts the use-case DTOs,
 * owns change detection and fan-out, and exposes the housekeeping jobs the host
 * schedules.
 */
export interface RssCloudCore {
    /** Establish or renew subscriptions. */
    subscribe(req: SubscribeRequest): Promise<SubscribeResponse>;
    /** Cancel subscriptions. */
    unsubscribe(req: UnsubscribeRequest): Promise<UnsubscribeResponse>;
    /**
     * Handle a change signal: re-fetch the resource, detect a change, and on a
     * change fan out to every subscriber via its protocol's plugin.
     */
    ping(req: PingRequest): Promise<PingResponse>;

    /** The observability bus (same instance passed in options, if any). */
    readonly events: EventBus;

    /** Drop expired/errored subscriptions and prune empty feeds. */
    removeExpired(): Promise<MaintenanceResult>;
    /** Compute the activity snapshot. */
    generateStats(): Promise<Stats>;
}

/** Signature of the core factory the implementation step will provide. */
export type CreateRssCloudCore = (
    options: RssCloudCoreOptions
) => RssCloudCore;
