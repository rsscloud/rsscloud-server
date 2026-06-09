/** Stable, machine-readable causes for an RssCloudError. */
export type RssCloudErrorCode =
    | 'PING_TOO_RECENT'
    | 'RESOURCE_READ_FAILED'
    | 'NO_RESOURCES'
    | 'INVALID_PROTOCOL'
    | 'UNSUPPORTED_PROTOCOL'
    | 'SUBSCRIPTION_VERIFICATION_FAILED';

/**
 * Shape of the domain error core raises. The concrete class (with `instanceof`
 * support) lands in the implementation step; consumers match on `code` rather
 * than on message text.
 */
export interface RssCloudError extends Error {
    code: RssCloudErrorCode;
}
