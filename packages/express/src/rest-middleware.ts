import express, { type Request, type RequestHandler } from 'express';
import {
    createRestDispatcher,
    type RestDispatcher,
    type RestResponseFormat,
    type RssCloudCore
} from '@rsscloud/core';
import { resolveClientAddress } from './client-address.js';

/** Construction-time dependencies shared by the REST front-door middleware. */
export interface RestMiddlewareOptions {
    core: Pick<RssCloudCore, 'subscribe' | 'ping'>;
}

/** Parses `application/x-www-form-urlencoded` bodies for the REST front doors. */
const urlencodedParser = express.urlencoded({ extended: false });

/** Negotiate the response format from the `Accept` header (`null` → 406). */
function negotiateFormat(req: Request): RestResponseFormat {
    return (req.accepts('xml', 'json') || null) as RestResponseFormat;
}

/**
 * Build the handler stack for a REST front door: parse the urlencoded body,
 * resolve the request context, hand it to one of the dispatcher's use cases,
 * and copy the rendered response onto the Express reply. `pleaseNotify` and
 * `ping` share the same shape and differ only in which use case they invoke.
 */
function restMiddleware(
    options: RestMiddlewareOptions,
    select: (dispatcher: RestDispatcher) => RestDispatcher['ping']
): RequestHandler[] {
    const dispatch = select(createRestDispatcher({ core: options.core }));
    const handler: RequestHandler = async (req, res) => {
        const result = await dispatch(req.body as Record<string, unknown>, {
            clientAddress: resolveClientAddress(req),
            format: negotiateFormat(req)
        });
        res.status(result.status)
            .set('Content-Type', result.contentType)
            .send(result.body);
    };
    return [urlencodedParser, handler];
}

/** Express handler stack for the rssCloud REST `pleaseNotify`. */
export function pleaseNotify(options: RestMiddlewareOptions): RequestHandler[] {
    return restMiddleware(options, (dispatcher) => dispatcher.pleaseNotify);
}

/** Express handler stack for the rssCloud REST `ping`. */
export function ping(options: RestMiddlewareOptions): RequestHandler[] {
    return restMiddleware(options, (dispatcher) => dispatcher.ping);
}
