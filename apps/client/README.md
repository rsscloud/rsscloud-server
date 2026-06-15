# @rsscloud/client-app

A private, interactive **dev harness** for the [rssCloud](https://github.com/rsscloud/rsscloud-server)
notification protocol — the subscriber + publisher end, the mirror of `@rsscloud/core`
(the hub end). It is **not published**; it exists to exercise a running rssCloud server
by hand.

The Express app ([`client.js`](client.js)) serves a **Subscribe/Ping UI** with a live
**request log**, and hosts the callback endpoint a hub notifies. It speaks both the
classic rssCloud protocol **and** [WebSub](https://www.w3.org/TR/websub/): the UI has a
separate WebSub control set (subscribe/unsubscribe/publish, with optional
`lease_seconds` and `secret`), the served feed advertises the hub via
`<atom:link rel="hub">`, and the WebSub callback echoes the intent-verification
challenge and reports the hub's `X-Hub-Signature` (with a valid/invalid verdict) on
content distribution. All the protocol wire work lives in [`lib/`](lib/) and is
reusable on its own.

## Running

From the repo root:

```bash
pnpm client          # start in watch mode (nodemon)
```

Or from this package:

```bash
pnpm --filter @rsscloud/client-app run dev    # watch mode
pnpm --filter @rsscloud/client-app start      # one-shot
```

It listens on `PORT`, advertises itself as `DOMAIN`, and targets a hub at
`http://localhost:5337`. Requires Node 22+ (uses the global `fetch`).

| Env var  | Default     | Purpose                                   |
| -------- | ----------- | ----------------------------------------- |
| `PORT`   | `9000`      | port the harness listens on               |
| `DOMAIN` | `localhost` | host it advertises as the callback domain |

## The `lib/` API

`require('./lib')` exposes these helpers (CommonJS):

- **`createRssCloudClient({ serverUrl, fetch? })`** — send `pleaseNotify` (subscribe)
  and `ping` (publish) to a hub over an injectable `fetch`. Returns `{ pleaseNotify, ping }`.
- **`createWebSubClient({ serverUrl, path?, fetch? })`** — send WebSub `hub.*` requests
  to a hub's front door (`path` defaults to `/websub`). Returns
  `{ subscribe, unsubscribe, publish }`; each resolves to the hub's raw reply
  (`{ status, body }`) and does **not** throw on a non-2xx.
- **`readVerification(query)`** — given a callback GET's query, return
  `{ mode, topic, challenge, leaseSeconds }` when it's a WebSub intent-verification
  request (the subscriber must echo `challenge` verbatim), else `null`.
- **`renderCloudFeed(feed)`** — emit an RSS 2.0 document carrying the `<cloud>` element
  that advertises a hub. Pass `hub` (a URL) to also advertise a WebSub hub via
  `<atom:link rel="hub">` plus a `rel="self"` link.
- **`buildNotifyResponse(success)`** — build the XML-RPC notify acknowledgement a
  subscriber returns to the hub.

### WebSub

```js
const { createWebSubClient } = require('./lib');

const hub = createWebSubClient({ serverUrl: 'http://localhost:5337' });

await hub.subscribe({
    callbackUrl: 'http://localhost:9000/websub-callback',
    topicUrl: 'http://localhost:9000/rss-01.xml',
    leaseSeconds: 3600, // optional; the hub clamps to its configured bounds
    secret: 's3cr3t' // optional; opts into a signed X-Hub-Signature delivery
});

await hub.publish({ topicUrl: 'http://localhost:9000/rss-01.xml' }); // hub.mode=publish
await hub.unsubscribe({ callbackUrl: '…', topicUrl: '…' });
```

### Subscribe

```js
const { createRssCloudClient } = require('./lib');

const client = createRssCloudClient({ serverUrl: 'http://localhost:5337' });

const { status, body } = await client.pleaseNotify({
    protocol: 'https-post',
    callback: { port: 443, path: '/notify' },
    feedUrl: 'https://feed.example/rss'
});
```

`callback.domain` is optional and selects the hub's verification flow: when given, the
hub verifies against that host (with a challenge for `http-post`/`https-post`); when
omitted, the hub uses the caller's address. `pleaseNotify` resolves to the hub's raw
reply (`{ status, body }`) and does **not** throw on a non-2xx — inspect `status`
yourself. Pass `protocol: 'xml-rpc'` to subscribe over the `/RPC2` front door instead
of REST.

### Ping

```js
const { createRssCloudClient } = require('./lib');

const client = createRssCloudClient({ serverUrl: 'http://localhost:5337' });

await client.ping({ feedUrl: 'https://feed.example/rss' }); // REST /ping
await client.ping({ transport: 'xml-rpc', feedUrl: '…' }); // /RPC2
```
