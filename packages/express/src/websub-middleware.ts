import express, { type RequestHandler } from 'express';
import { createWebSubDispatcher, type RssCloudCore } from '@rsscloud/core';

/** Construction-time dependencies for the WebSub front-door middleware. */
export interface WebSubMiddlewareOptions {
    core: Pick<
        RssCloudCore,
        'acceptSubscription' | 'acceptUnsubscription' | 'acceptPublish'
    >;
}

/** Parses the `application/x-www-form-urlencoded` `hub.*` body. */
const urlencodedParser = express.urlencoded({ extended: false });

/**
 * Express handler stack for the WebSub hub front door. Thin by design — it
 * parses the form body and copies the dispatcher's status onto the reply; the
 * `hub.*` parsing and the accept/`202` decision live in core's
 * {@link createWebSubDispatcher}.
 */
export function websub(options: WebSubMiddlewareOptions): RequestHandler[] {
    const dispatcher = createWebSubDispatcher({ core: options.core });
    const handler: RequestHandler = (req, res) => {
        const result = dispatcher.dispatch(req.body as Record<string, unknown>);
        res.status(result.status).end();
    };
    return [urlencodedParser, handler];
}
