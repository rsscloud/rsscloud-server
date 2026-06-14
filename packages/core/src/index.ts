export const version = '0.0.0';

// Implementations
export { createRssCloudCore } from './engine/create-core.js';
export {
    createInProcessVerificationScheduler,
    type VerificationScheduler,
    type InProcessVerificationSchedulerOptions
} from './engine/verification-scheduler.js';
export { DEFAULT_CONFIG, resolveConfig } from './config.js';
export { createEventBus } from './events.js';
export { RssCloudError } from './errors.js';
export {
    createRestProtocolPlugin,
    type RestProtocolPluginOptions
} from './protocols/rest-plugin.js';
export {
    createXmlRpcProtocolPlugin,
    type XmlRpcProtocolPluginOptions
} from './protocols/xml-rpc-plugin.js';
export {
    createXmlRpcDispatcher,
    type XmlRpcDispatcher,
    type XmlRpcDispatcherOptions,
    type XmlRpcDispatchContext
} from './protocols/xml-rpc-dispatcher.js';
export {
    createRestDispatcher,
    type RestDispatcher,
    type RestDispatcherOptions,
    type RestDispatchContext,
    type RestResponse,
    type RestResponseFormat
} from './protocols/rest-dispatcher.js';
export {
    createDefaultFeedParser,
    type DefaultFeedParserOptions
} from './feed/feed-parser.js';
export { createInMemoryStore } from './store/memory-store.js';
export {
    createFileStore,
    type FileStore,
    type FileStoreOptions
} from './store/file-store.js';
export {
    resourceToJson,
    resourceFromJson,
    subscriptionToJson,
    subscriptionFromJson,
    type JsonResource,
    type JsonSubscription
} from './store/store-codec.js';

// Contracts
export type { BuiltInProtocol, Protocol } from './engine/protocol.js';
export type { FeedMetadata, FeedParser } from './feed/feed.js';
export type { Resource } from './engine/resource.js';
export type { Subscription } from './engine/subscription.js';
export type { FeedEntry, Store } from './store/store.js';
export type {
    SubscribeRequest,
    SubscribeResult,
    SubscribeResponse,
    UnsubscribeRequest,
    UnsubscribeResponse,
    PingRequest,
    PingResponse
} from './engine/dto.js';
export type {
    ResourcePayload,
    DeliveryResult,
    VerifyContext,
    DeliveryContext,
    ProtocolPlugin
} from './engine/plugin.js';
export type { RssCloudEventMap, EventBus, CreateEventBus } from './events.js';
export type { RssCloudConfig, ResolveConfig } from './config.js';
export type { RssCloudErrorCode } from './errors.js';
export type { FeedStat, Stats, MaintenanceResult } from './engine/stats.js';
export type {
    RssCloudCoreOptions,
    RssCloudCore,
    CreateRssCloudCore
} from './engine/core.js';
