import type { SubscribeResult } from '../engine/dto.js';
import { RssCloudError } from '../errors.js';

/**
 * The rssCloud wire vocabulary, ported from the legacy server's
 * `app-messages.js`. The dispatchers own these user-facing strings because the
 * same engine condition can surface with different wording depending on the
 * front door — a failed read is "The ping was cancelled..." via `/ping` but
 * "The subscription was cancelled..." via `/pleaseNotify` — so the engine
 * speaks codes and the adapter chooses the words.
 */
export const appMessages = {
    error: {
        subscription: {
            missingParams: (params: string): string =>
                `The following parameters were missing from the request body: ${params}.`,
            invalidProtocol: (protocol: string): string =>
                `Can't accept the subscription because the protocol, <i>${protocol}</i>, is unsupported.`,
            readResource: (url: string): string =>
                `The subscription was cancelled because there was an error reading the resource at URL ${url}.`,
            failedHandler:
                'The subscription was cancelled because the call failed when we tested the handler.',
            noResources: 'No resources specified.'
        },
        ping: {
            readResource: (url: string): string =>
                `The ping was cancelled because there was an error reading the resource at URL ${url}.`
        },
        rpc: {
            notEnoughParams: (method: string): string =>
                `Can't call "${method}" because there aren't enough parameters.`,
            tooManyParams: (method: string): string =>
                `Can't call "${method}" because there are too many parameters.`
        }
    },
    success: {
        subscription:
            'Thanks for the registration. It worked. When the resource updates we\'ll notify you. Don\'t forget to re-register after 24 hours, your subscription will expire in 25. Keep on truckin!'
    }
};

/** Extract a message from any thrown value. */
export function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * The wire message for a failed subscribe: the first failed resource's specific
 * wording, falling back to the response's summary `message`.
 */
export function subscriptionFailureMessage(
    results: SubscribeResult[] | undefined,
    fallback: string
): string {
    const failed = (results ?? []).find(
        (result) => result.errorCode !== undefined
    );
    switch (failed?.errorCode) {
        case 'RESOURCE_READ_FAILED':
            return appMessages.error.subscription.readResource(
                failed.resourceUrl
            );
        case 'SUBSCRIPTION_VERIFICATION_FAILED':
            return appMessages.error.subscription.failedHandler;
        default:
            return fallback;
    }
}

/**
 * The wire message for an error thrown out of a subscribe request: a coded
 * no-resources error gets the legacy wording; anything else (a mapping error
 * whose message is already final, or an incidental failure) keeps its message.
 */
export function subscriptionRequestErrorMessage(err: unknown): string {
    if (err instanceof RssCloudError && err.code === 'NO_RESOURCES') {
        return appMessages.error.subscription.noResources;
    }
    return errorMessage(err);
}
