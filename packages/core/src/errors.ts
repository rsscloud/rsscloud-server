/** Stable, machine-readable causes for an RssCloudError. */
export type RssCloudErrorCode =
    | 'PING_TOO_RECENT'
    | 'RESOURCE_READ_FAILED'
    | 'NO_RESOURCES'
    | 'INVALID_PROTOCOL'
    | 'UNSUPPORTED_PROTOCOL'
    | 'SUBSCRIPTION_VERIFICATION_FAILED';

/**
 * The domain error core raises. Consumers match on `code` rather than on
 * message text; `instanceof RssCloudError` distinguishes it from incidental
 * failures (network errors, bugs).
 */
export class RssCloudError extends Error {
    readonly code: RssCloudErrorCode;

    constructor(code: RssCloudErrorCode, message: string) {
        super(message);
        this.name = 'RssCloudError';
        this.code = code;
    }
}
