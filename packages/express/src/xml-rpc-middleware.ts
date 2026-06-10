import express, { type RequestHandler } from 'express';
import { createXmlRpcDispatcher, type RssCloudCore } from '@rsscloud/core';
import { resolveClientAddress } from './client-address.js';

/** Construction-time dependencies for the XML-RPC front-door middleware. */
export interface XmlRpcMiddlewareOptions {
    core: Pick<RssCloudCore, 'subscribe' | 'ping'>;
}

/** Parses any XML content-type body into the raw string the dispatcher expects. */
const xmlTextParser = express.text({ type: '*/xml' });

/** Express handler stack for the rssCloud XML-RPC `/RPC2` front door. */
export function rpc2(options: XmlRpcMiddlewareOptions): RequestHandler[] {
    const dispatcher = createXmlRpcDispatcher({ core: options.core });
    const handler: RequestHandler = async (req, res) => {
        if (!req.accepts('xml')) {
            res.status(406)
                .set('Content-Type', 'text/plain')
                .send('Not Acceptable');
            return;
        }
        const xmlBody = typeof req.body === 'string' ? req.body : '';
        const xml = await dispatcher.dispatch(xmlBody, {
            clientAddress: resolveClientAddress(req)
        });
        res.status(200).set('Content-Type', 'text/xml').send(xml);
    };
    return [xmlTextParser, handler];
}
