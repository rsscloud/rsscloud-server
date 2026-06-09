export const version = '0.0.0';

// Implementations
export { createRssCloudCore } from './create-core.js';
export { DEFAULT_CONFIG, resolveConfig } from './config.js';
export { createEventBus } from './events.js';
export { RssCloudError } from './errors.js';
export {
    createRestProtocolPlugin,
    type RestProtocolPluginOptions
} from './rest-plugin.js';
export {
    createDefaultFeedParser,
    type DefaultFeedParserOptions
} from './feed-parser.js';
export { createInMemoryStore } from './memory-store.js';

// Contracts
export type { BuiltInProtocol, Protocol } from './protocol.js';
export type { FeedMetadata, FeedParser } from './feed.js';
export type { Resource } from './resource.js';
export type { Subscription } from './subscription.js';
export type { FeedEntry, Store } from './store.js';
export type {
    SubscribeRequest,
    SubscribeResult,
    SubscribeResponse,
    UnsubscribeRequest,
    UnsubscribeResponse,
    PingRequest,
    PingResponse
} from './dto.js';
export type {
    ResourcePayload,
    DeliveryResult,
    VerifyContext,
    DeliveryContext,
    ProtocolPlugin
} from './plugin.js';
export type { RssCloudEventMap, EventBus, CreateEventBus } from './events.js';
export type { RssCloudConfig, ResolveConfig } from './config.js';
export type { RssCloudErrorCode } from './errors.js';
export type { FeedStat, Stats, MaintenanceResult } from './stats.js';
export type {
    RssCloudCoreOptions,
    RssCloudCore,
    CreateRssCloudCore
} from './core.js';
