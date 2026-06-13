# TODO — rsscloud-server: open work

Outstanding + future work only. Completed work lives in git history, not here —
that includes the `apps/server` → `@rsscloud/core` migration, the on-disk **v2
format unification** (disk == domain model; `legacy-store-shape.js` deleted; one-way
legacy importer in `file-store.ts`), and the 2026-06 architecture-cleanup passes
across `@rsscloud/core` and `apps/server` (`refactor(core):` / `refactor(server):`
commits). Per CLAUDE.md: build with the `tdd` skill (red-green vertical slices);
Conventional Commits enforced. Architecture decisions are recorded in `docs/adr/`;
domain vocabulary in `CONTEXT.md`.

## WebSub hub support (bigger — spans core + express)

Make the server act as a [WebSub](https://www.w3.org/TR/websub/) **hub** (the W3C
successor to PubSubHubbub, rssCloud's cousin). Needs new protocol logic in
`@rsscloud/core` **and** a new `@rsscloud/express` middleware, plus a delivery model
the notification plugins don't cover. Sketch, not a spec.

*What it adds over rssCloud's notify-only model:*
- **Subscribe request:** form-encoded POST — `hub.callback`, `hub.mode`
  (subscribe|unsubscribe), `hub.topic`, optional `hub.lease_seconds` + `hub.secret`.
  Hub replies `202` (async verify) or 4xx.
- **Intent verification:** hub GETs the callback with `hub.challenge`; the subscriber
  echoes it. Same shape as the rssCloud REST challenge core already does — reuse it.
- **Content distribution (the big new piece):** on update the hub POSTs the *actual
  feed content* to each callback — topic `Content-Type`, `Link` rel=hub/self, and
  `X-Hub-Signature: sha256=HMAC(secret, body)`. The REST/XML-RPC plugins send a
  notification, not content, so this needs a new delivery plugin.
- **Leases:** `hub.lease_seconds` + renewal (distinct from `ctSecsResourceExpire`).

*Pieces:* a core subscribe/unsubscribe dispatcher + content-delivery plugin (new
`Subscription` fields `secret` / `leaseSeconds` / `callback`+`topic` / mode; likely a
`websub` protocol value); a `websub({ core })` express factory branching on
`hub.mode`; mount the hub at a stable URL (publishers reference it via
`<link rel="hub">` in their own feeds — the hub doesn't host the source). The
REST/XML-RPC subscribe parsing now shares `buildSubscribeRequest(SubscribeParams)` in
core (one callback-assembly seam); a WebSub `hub.*` parser can build a `SubscribeRequest`
through it rather than re-deriving callback/scheme/`diffDomain` logic.

*Open questions:* sync vs async intent verification (spec prefers async `202`); which
HMAC algos to require; content source on publish (fetch vs publisher-pushed). The new
subscription fields now persist directly — the domain-model v2 disk format is in place,
so new `Subscription` fields ride along with no extra mapping.

*First slice:* core `subscribe` happy path (parse, verify intent, persist) + the
express `websub` factory + an e2e callback handshake. Defer content distribution,
HMAC, and leases.

## Client extraction + shared XML-RPC codec (bigger — three workspaces)

Pull `apps/server/client.js` (568 lines: protocol wire logic + outbound calls + a
stateful Express dev UI) into a published `@rsscloud/client` package plus a private
`apps/client` harness — mirroring how `apps/server` consumes `@rsscloud/core`. It
already works against the live server, so this is extraction + packaging, not a
behaviour change. The 2026-06-13 architecture review settled that **this is the only
extraction `apps/server` warrants** — the other read-models (`feeds-json`,
`feeds-opml`, the stats projection) have one consumer each, and the rest is
host/composition.

The wire logic is **not** independently reimplemented (the e2e convention is for the
test harness, not two libraries). Instead a focused **`@rsscloud/xml-rpc`** package
holds the generic XML-RPC codec that both core (hub) and client (subscriber/publisher)
build on — two production consumers, a real seam (delete it and encode/decode reappears
in both). Depending on `@rsscloud/core` for this would be the wrong direction (the
client would drag in the whole hub engine for ~150 lines of codec). e2e stays
independent — deliberately not a consumer.

```
@rsscloud/xml-rpc   generic XML-RPC codec (no rssCloud semantics)
   ├─ @rsscloud/core    hub: parse pleaseNotify/ping, emit success/fault, build notify
   └─ @rsscloud/client  subscriber/publisher: build pleaseNotify/ping, parse notify, emit success
apps/client   private Express dev harness on @rsscloud/client
```

### `@rsscloud/xml-rpc` (new, published, 100% coverage)
Generic XML-RPC only — no `rssCloud.*` knowledge.
- `parseMethodCall(xml)` + `parseMethodResponse(xml)` (the decoder moves out of core).
- `buildMethodCall(methodName, params)` — **new** typed-value builder (core's current
  encoders are ad-hoc/untyped).
- `buildMethodResponse(value)` / `serializeFault(code, str)`.
- An **`XmlRpcValue` model** (`i4`/`string`/`boolean`/`array`/`struct`/…) — the one real
  design piece; worth a short grill at that slice.
- Core refactor: `xml-rpc-dispatcher` + `xml-rpc-plugin` import from it; core keeps only
  its rssCloud-specific shapes as thin wrappers. Core's 25 codec tests move here; core
  stays green + 100%.

### `@rsscloud/client` (new, published, 100% coverage) — factory API, full subscriber+publisher
```
createRssCloudClient({ serverUrl, fetch? }) → {
  pleaseNotify({ protocol, callback: { domain, port, path }, feedUrl }) → { status, body }
  ping({ protocol, feedUrl }) → { status, body }
}
```
Plus exported pure helpers: `parseNotify(body)` → feedUrl, `buildNotifyResponse()` (the
boolean XML), challenge echo, and `renderCloudFeed({ feedName, link, items, cloud })`
(RSS-with-`<cloud>`). The rssCloud XML-RPC builders (`buildPleaseNotifyCall`,
`buildPingCall`) live here over `@rsscloud/xml-rpc`'s `buildMethodCall`; REST bodies are
trivial `URLSearchParams`.

### `apps/client` (private, like `apps/e2e`)
The Express UI, request log, feed store, and routes — consuming `@rsscloud/client`. The
`client` script + `body-parser`/`xmlbuilder`/`morgan` deps move here out of `apps/server`.

### Slices (codec-first → no transient duplication; each stays green)
1. Scaffold `@rsscloud/xml-rpc`; add to `release-please-config.json`.
2. Move the decoder (`parseMethodCall` + value decode) + its tests into it.
3. Add the typed `XmlRpcValue` builder (`buildMethodCall`/`buildMethodResponse`/fault), TDD.
4. Refactor core onto it — dispatcher/plugin import the generic codec; core green + 100%.
5. Scaffold `@rsscloud/client`; add to release config.
6. Client XML-RPC builders (`buildPleaseNotifyCall`/`buildPingCall`) on the shared codec, TDD.
7. Client send layer — `createRssCloudClient` with injected `fetch`, REST + XML-RPC, TDD.
8. Client receive + feed emit — `parseNotify`/`buildNotifyResponse`/challenge + `renderCloudFeed`, TDD.
9. Thin `client.js` onto `@rsscloud/client` (still in `apps/server`, still runs).
10. Relocate to `apps/client` (new private workspace; drop the script/deps from `apps/server`;
    handle `express.static('public')`).

Steps 1–4 are a self-contained, shippable improvement (core slims, no client yet); 5–10
build and land the client.

*Workspace/release:* `pnpm-workspace.yaml` already globs `packages/*` + `apps/*` (no
change). `release-please-config.json` gains `packages/xml-rpc` + `packages/client`
(components `xml-rpc` / `client`); `apps/client` stays untracked like `apps/e2e`. Cascade:
`xml-rpc → core → express → server`, and `xml-rpc → client`.

*Notes:* `CONTEXT.md` gains subscriber/publisher-end vocabulary during implementation.
**WebSub-ready:** the client grows a WebSub subscriber/publisher once that lands.
