# @rsscloud/client

The **subscriber + publisher end** of the [rssCloud](https://github.com/rsscloud/rsscloud-server)
notification protocol — the mirror of `@rsscloud/core` (the hub end). It talks to a
hub over an injectable `fetch`, so it has no server dependency.

- **Subscriber:** send `pleaseNotify`, answer the verify challenge, and parse the
  notifications the hub posts back.
- **Publisher:** send `ping` when a feed changes, and render a feed carrying the
  `<cloud>` element.

The common transport is **`http-post` / `https-post`** (a plain form POST and a
form-POST callback). rssCloud's original **XML-RPC** transport is also supported as a
[secondary option](#xml-rpc-secondary).

## Install

```bash
pnpm add @rsscloud/client
```

Requires Node 22+ (uses the global `fetch`).

## Subscribe (`https-post`)

Register a callback so the hub notifies you when a feed changes:

```ts
import { createRssCloudClient } from '@rsscloud/client';

const client = createRssCloudClient({ serverUrl: 'https://hub.example' });

const { status, body } = await client.pleaseNotify({
    protocol: 'https-post',
    callback: { domain: 'sub.example', port: 443, path: '/notify' },
    feedUrl: 'https://feed.example/rss'
});
```

> `callback.domain` is **optional** and selects the verification flow on every
> transport. Give it (as above) and the hub uses that host — confirming an
> `http-post`/`https-post` callback with a one-time challenge `GET` to it. Omit it
> and the hub falls back to your connection's address with no challenge:
>
> ```ts
> await client.pleaseNotify({
>     protocol: 'http-post',
>     callback: { port: 9000, path: '/notify' }, // no domain → caller address
>     feedUrl: 'https://feed.example/rss'
> });
> ```
>
> For a public HTTPS callback you'll usually want the explicit `domain` so the hub
> reaches your real host. Use `protocol: 'http-post'` for a plain (non-TLS)
> callback, e.g. in local development.

Then serve the callback the hub will call. It does two things: answer the one-time
**verify challenge** (a `GET` carrying `?challenge=…`), and accept **notifications**
(a `POST` with the changed resource URL in a `url` form field):

```ts
import express from 'express';
import { parseHttpPostNotify } from '@rsscloud/client';

const app = express();

// 1. Verify handshake — echo the challenge back verbatim.
app.get('/notify', (req, res) => {
    res.send(String(req.query.challenge ?? ''));
});

// 2. Notification — the changed resource URL arrives as `url`.
app.post(
    '/notify',
    express.text({ type: 'application/x-www-form-urlencoded' }),
    (req, res) => {
        const feedUrl = parseHttpPostNotify(req.body);
        // ...re-fetch feedUrl and process the update...
        res.end();
    }
);

app.listen(443);
```

`pleaseNotify` resolves to the hub's raw reply (`{ status, body }`); it does not
throw on a non-2xx — inspect `status` yourself.

## Ping (publish a change)

When your feed updates, tell the hub:

```ts
import { createRssCloudClient } from '@rsscloud/client';

const client = createRssCloudClient({ serverUrl: 'https://hub.example' });

await client.ping({ feedUrl: 'https://feed.example/rss' });
```

`ping` posts to the hub's REST `/ping` front door by default.

## Advertising the hub in your feed

Publishers announce their hub with a `<cloud>` element so subscribers know where to
`pleaseNotify`. `renderCloudFeed` emits an RSS 2.0 document with it:

```ts
import { renderCloudFeed } from '@rsscloud/client';

const xml = renderCloudFeed({
    title: 'Example feed',
    link: 'https://feed.example/rss',
    description: 'An rssCloud-enabled feed',
    cloud: {
        domain: 'hub.example',
        port: 443,
        path: '/pleaseNotify',
        registerProcedure: '',
        protocol: 'http-post'
    },
    items: [
        {
            title: 'First post',
            description: 'Hello, cloud',
            pubDate: new Date(),
            guid: 'https://feed.example/posts/1'
        }
    ]
});
```

## XML-RPC (secondary)

For hubs and subscribers that speak rssCloud's original XML-RPC transport. The shape
is the same; the protocol/transport switches change the front door used:

```ts
// Subscribe over XML-RPC (POSTed to the hub's /RPC2).
await client.pleaseNotify({
    protocol: 'xml-rpc',
    callback: { domain: 'sub.example', port: 9000, path: '/RPC2' },
    feedUrl: 'https://feed.example/rss'
});

// Ping over XML-RPC.
await client.ping({ feedUrl: 'https://feed.example/rss', transport: 'xml-rpc' });
```

An XML-RPC callback receives an `rssCloud.notify` `methodCall` and must answer with a
boolean-true `methodResponse`:

```ts
import { parseXmlRpcNotify, buildNotifyResponse } from '@rsscloud/client';

app.post('/RPC2', express.text({ type: '*/xml' }), async (req, res) => {
    const feedUrl = await parseXmlRpcNotify(req.body);
    // ...re-fetch feedUrl and process the update...
    res.type('text/xml').send(buildNotifyResponse());
});
```

The low-level wire builders (`buildPleaseNotifyCall`, `buildPingCall`) are exported
too, over the shared [`@rsscloud/xml-rpc`](../xml-rpc) codec, if you need to drive the
XML-RPC calls directly.

## License

MIT — see [LICENSE.md](./LICENSE.md).
