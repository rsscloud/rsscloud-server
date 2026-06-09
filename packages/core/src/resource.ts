import type { FeedMetadata } from './feed.js';

/**
 * A feed the server tracks. Holds change-detection state plus the most recently
 * parsed feed metadata. Keyed in the Store by `url`.
 */
export interface Resource {
    /** The feed URL. Also the store key and the WebSub "topic". */
    url: string;

    /** md5 of the body at the last successful check. */
    lastHash: string;
    /** Byte length of the body at the last successful check. */
    lastSize: number;
    /** Total number of times the feed has been fetched/checked. */
    ctChecks: number;
    /** When the feed was last fetched. */
    whenLastCheck: Date;
    /** Total number of times the feed was observed to have changed. */
    ctUpdates: number;
    /** When the feed last changed. */
    whenLastUpdate: Date;

    /** Cached feed metadata, refreshed whenever the body changes. */
    feed?: FeedMetadata;
}
