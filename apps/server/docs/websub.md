# WebSub

This server is also a [WebSub](https://www.w3.org/TR/websub/) hub. WebSub (formerly
PubSubHubbub) is a W3C-standard publish/subscribe protocol for web content:
subscribers register a callback, the hub verifies their intent, and on each update the
hub delivers the **full feed body** to the callback — optionally signed.

A single publish reaches WebSub subscribers **and** rssCloud subscribers alike; see
[How it fits together](cross-protocol.md).

All hub operations share one endpoint:

**`POST /websub`** — `application/x-www-form-urlencoded`, with `hub.*` fields. (The
path is configurable via `WEBSUB_PATH`; `/websub` is the default.)

## Subscribe and unsubscribe

| Field              | Required | Meaning                                                                 |
| ------------------ | -------- | ----------------------------------------------------------------------- |
| `hub.mode`         | yes      | `subscribe` or `unsubscribe`.                                           |
| `hub.callback`     | yes      | Absolute URL the hub delivers to (and verifies against).                |
| `hub.topic`        | yes      | Absolute URL of the feed you want.                                      |
| `hub.lease_seconds`| no       | Requested subscription lifetime; the hub clamps it (see [Leases](#leases)). |
| `hub.secret`       | no       | Shared secret that opts you into [signed delivery](#authenticated-delivery). |

A well-formed request is acknowledged immediately with **`202 Accepted`**; a malformed
one (missing/relative `hub.callback`, empty `hub.topic`, unknown `hub.mode`) returns
**`400`**. The `202` only means the request was accepted — the subscription is not
active until intent verification succeeds.

## Intent verification

After a `202`, the hub confirms the request out of band by sending a `GET` to your
`hub.callback` with these query parameters:

| Parameter           | Meaning                                                        |
| ------------------- | -------------------------------------------------------------- |
| `hub.mode`          | `subscribe` or `unsubscribe` (echoes the request).             |
| `hub.topic`         | The topic URL.                                                 |
| `hub.challenge`     | A random token.                                                |
| `hub.lease_seconds` | The lease the hub actually granted (subscribe only; see below).|

To confirm, respond **`2xx`** with a body that is **exactly** the `hub.challenge`
value. Any other status, or a body that doesn't match, and the hub discards the
subscription.

## Leases

`hub.lease_seconds` is a request, not a guarantee. The hub clamps it to its configured
bounds and tells you the granted value in the verification GET's `hub.lease_seconds`:

| Bound   | Config key                  | Default            |
| ------- | --------------------------- | ------------------ |
| default | `WEBSUB_LEASE_DEFAULT_SECS` | `86400` (1 day)    |
| minimum | `WEBSUB_LEASE_MIN_SECS`     | `300` (5 minutes)  |
| maximum | `WEBSUB_LEASE_MAX_SECS`     | `864000` (10 days) |

If you omit `hub.lease_seconds` you get the default. Re-subscribe before the lease
expires to renew it.

## Content distribution

When the topic changes, the hub `POST`s to your `hub.callback`:

- **Body** — the full fetched feed content.
- **`Content-Type`** — relayed from the origin feed (or `application/octet-stream` if
  the origin sent none).
- **`Link`** — `<hub-url>; rel="hub", <topic-url>; rel="self"`, advertising the hub and
  the canonical topic.
- **`X-Hub-Signature`** — only when you subscribed with a `hub.secret` (see below).

Respond with any `2xx` to acknowledge. Redirects are followed.

### Authenticated delivery

If you supplied `hub.secret`, the hub signs each delivery with an
`X-Hub-Signature: <algo>=<hex>` header, where `<hex>` is the HMAC of the request body
keyed by your secret. The algorithm is `sha256` by default (configurable via
`WEBSUB_SIGNATURE_ALGO`). Recompute the HMAC over the received body and compare to
reject spoofed deliveries.

## Publishing

A publisher can notify the hub natively over WebSub instead of an rssCloud ping:

| Field      | Required | Meaning                                             |
| ---------- | -------- | --------------------------------------------------- |
| `hub.mode` | yes      | `publish`.                                          |
| `hub.url`  | yes\*    | The topic URL that changed. (`hub.topic` is accepted as a fallback.) |

The hub answers `202`, then re-fetches the topic and fans the change out. This is
exactly the path an rssCloud `/ping` takes, so a WebSub publish also reaches rssCloud
subscribers — see [How it fits together](cross-protocol.md).

## SSRF egress protection

Both `hub.topic`/`hub.url` (which the hub **fetches**) and `hub.callback` (which the hub
**delivers** the fetched body to) are supplied by untrusted clients. To stop them being
pointed at the hub's own network, every outbound request — topic re-fetch, the intent
verification GET, and content delivery — is screened: the destination is rejected at
connect time if its host resolves to a non-public address (loopback, private, link-local
incl. cloud-metadata `169.254.169.254`, unique-local, CGNAT). Screening is done on the
resolved IP and re-applied on every redirect hop, so a hostname or redirect that points
inward is refused, not followed.

| Config key                  | Default | Meaning                                                                                   |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `WEBSUB_SSRF_PROTECTION`    | `on`    | Set to `off` (or `false`/`0`/`no`) to disable screening — only for trusted/loopback test setups. |
| `WEBSUB_FETCH_ALLOW_CIDRS`  | _(none)_| Comma-separated CIDRs exempted from screening, for a hub that legitimately serves feeds on a private LAN (e.g. `10.0.0.0/8,192.168.0.0/16`). |

A blocked request surfaces as a failed fetch: the topic re-fetch reports a read failure
and a blocked callback counts as a failed delivery.

## Using WebSub with your feed

So that subscribers can **discover** this hub, advertise it from the resource you want
watched. Per the WebSub spec, advertise it two ways, in priority order:

1. **HTTP `Link` header (primary).** When your server returns the feed, include:

   ```http
   Link: <https://hub.example/websub>; rel="hub"
   Link: <https://feed.example/rss>; rel="self"
   ```

   The header is authoritative and works for any content type, so it's the preferred
   mechanism.

2. **`<atom:link>` in the feed (backup).** Inside the feed document, declare the Atom
   namespace and add the hub and self links — useful for consumers that only read the
   body:

   ```xml
   <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
     <channel>
       <atom:link rel="hub" href="https://hub.example/websub"/>
       <atom:link rel="self" href="https://feed.example/rss"/>
       <!-- … -->
     </channel>
   </rss>
   ```

A subscriber reads the `rel="hub"` link to find this endpoint and the `rel="self"`
link to learn the canonical topic URL, then subscribes as above. (Note: discovery is a
subscriber-side concern — this hub accepts explicit `hub.topic` subscriptions
regardless of how the feed advertises itself.)

---

← [Back to the documentation index](../README.md)
