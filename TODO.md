# TODO — rsscloud-server: open work

Outstanding + future work only. Completed work lives in git history, not here —
that includes the `apps/server` → `@rsscloud/core` migration, the on-disk **v2
format unification** (disk == domain model; `legacy-store-shape.js` deleted; one-way
legacy importer in `file-store.ts`), the 2026-06 architecture-cleanup passes
across `@rsscloud/core` and `apps/server`, and the shared **`@rsscloud/xml-rpc`** codec
(core builds its `/RPC2` dispatcher on it). The subscriber/publisher client logic lives
in `apps/client` (its `lib/`), not a published package — a real subscriber must host a
notify endpoint, so it's app logic for now. Per CLAUDE.md: build with the `tdd` skill (red-green vertical slices);
Conventional Commits enforced. Architecture decisions are recorded in `docs/adr/`;
domain vocabulary in `CONTEXT.md`.

## WebSub hub support (bigger — spans core + express)

Make the server act as a [WebSub](https://www.w3.org/TR/websub/) **hub** (the W3C
successor to PubSubHubbub, rssCloud's cousin). Hub only — `apps/client` already owns the
subscriber/publisher side; the hub never hosts source feeds (publishers point at it via
`<link rel="hub">` in their own feeds). Needs new protocol logic in `@rsscloud/core`
**and** a new `@rsscloud/express` middleware, plus a content-delivery model the
notify-only REST/XML-RPC plugins don't cover.

The engine is already primed: `protocol.ts` lists `'websub'`; `Subscription` /
`SubscribeRequest` / `UnsubscribeRequest` carry a `details` bag for protocol extras;
`whenExpires` + `removeExpired()` are where a lease maps; `ProtocolPlugin` has
`verify`/`deliver`; and `DeliveryContext` already carries `payload: ResourcePayload`
(the feed body + content-type captured by `detectChange` on every ping). So the
fan-out machinery is waiting for a plugin — most new code is the WebSub plugin, a
`hub.*` parser/dispatcher, an express factory, the async-accept seam, and wiring.

### Primary use case — free WebSub for rssCloud publishers

A publisher already on this server for rssCloud adds `<link rel="hub" href=".../websub">`
to their feed and **keeps pinging exactly as today** (`/ping` / `rssCloud.ping`). Anyone
who subscribes to that feed *via WebSub* then gets full WebSub content distribution —
**the publisher never speaks WebSub and changes nothing but the feed header.**

This falls out of core's existing design, which is why WebSub belongs *in core*, not the
HTTP edge: `ping()` → `detectChange()` already fetches the feed body and builds `payload`
on **every** ping; `fanOut(resourceUrl, …)` loads **all** subscriptions for the resource
and selects the plugin **per subscription** (`deliverTo`). So one rssCloud ping already
iterates every subscriber of that topic and dispatches each through its own plugin —
an rssCloud sub gets a notify, a `protocol:'websub'` sub gets content distribution, from
the *same* ping and the *same* already-fetched body. The only missing piece is the
WebSub `deliver()` plugin. Consequences:

- **No new publish path is required for the headline case** — the trigger is the
  existing rssCloud ping. The WebSub `hub.mode=publish` front door and fat pings serve
  *pure-WebSub* publishers (no rssCloud) and are therefore **secondary** (later phases).
- **Topic identity is the one hard requirement:** a subscriber's `hub.topic` must be the
  same URL string the publisher pings (the store keys feed entries by exact resource
  URL). Same exactness rssCloud already requires between subscribe-URL and ping-URL —
  WebSub just inherits it. URL normalization is out of scope (matches today's behavior).
- **WebSub adds no fetch overhead on ping** — it reuses the body `detectChange` already
  fetched; it only adds an extra outbound POST per WebSub subscriber.

### Decisions (settled — 2026-06-14)

1. **Intent verification = async `202`.** The hub validates the request synchronously
   (→ `4xx` on malformed), returns `202 Accepted`, then performs the `hub.challenge`
   GET out of band and records the subscription only on success.
2. **Best-effort now, queue later — behind one seam.** Async ≠ a queue. A single
   **verification-dispatch seam** runs the verify+persist task in-process (one attempt;
   failures logged; a restart mid-flight drops the pending request — the subscriber
   re-subscribes). A persisted-queue + retry implementation later satisfies the *same*
   seam (draining on the existing maintenance interval, persisting via the store) with
   **no change** to the `hub.*` parser, the plugin's `verify()`, or the express factory.
   Captured as an ADR. **The scheduler is additive and WebSub-only:** rssCloud
   `pleaseNotify`/`subscribe` stays synchronous (its callers expect an immediate yes/no)
   and `ping`/`fanOut`/`deliver` are untouched — it's a brand-new caller of an unchanged
   `core.subscribe`, so no existing rssCloud behavior changes. It lives in core (not
   express) only so the future persisted queue can reach the store; the in-process
   default would work anywhere.
3. **Publish = both.** Accept a thin WebSub publish (`hub.mode=publish`, `hub.url`/
   `hub.topic`) — and keep rssCloud `/ping` — re-fetching the topic and reusing
   `core.ping`'s existing fetch→`payload`→`fanOut`. *Also* accept fat pings (publisher
   POSTs the body), distributed verbatim without a re-fetch; this adds an optional
   pushed-content path to `PingRequest`/`detectChange`. (Fat-ping wire format is
   non-standard — see open questions — so it lands last.)
4. **Lease = honor requested, clamped.** Use `hub.lease_seconds` clamped to a
   configurable `[min, max]` (default when omitted); store the chosen value in
   `details.leaseSeconds`, set `whenExpires = now + chosen`, and echo the chosen value
   in the verification GET. `removeExpired()` drops it on lapse, unchanged.
5. **Signature = HMAC-SHA256, configurable.** When a subscriber supplied `hub.secret`,
   sign each delivery with `X-Hub-Signature: sha256=…` (algorithm a config knob, default
   `sha256`). No `hub.secret` → no signature header.

### Architecture notes / corrections to the original sketch

- **WebSub builds `SubscribeRequest` directly — it does *not* reuse
  `buildSubscribeRequest`.** That builder exists to assemble a callback from
  port/path/domain (`glueUrlParts`, scheme, `diffDomain`) for REST/XML-RPC. WebSub
  already arrives with a complete `hub.callback` URL, so the dispatcher sets
  `callbackUrl = hub.callback`, `resourceUrls = [hub.topic]`, `protocol = 'websub'`,
  `details = { secret?, leaseSeconds }` and skips the builder. (The sketch's hope to
  share that seam doesn't pan out.) `buildSubscribeRequest` also gates on
  `VALID_PROTOCOLS` (rssCloud only) — leave it as-is.
- **WebSub always verifies intent** (spec mandate), so the plugin's `verify()` ignores
  `diffDomain` and always does the challenge GET — never the same-domain test-notify.
- **`core.unsubscribe()` has no verify hook today.** WebSub unsubscribe must *also* be
  intent-verified (`hub.mode=unsubscribe` challenge GET) before removal — the scheduled
  task verifies, then calls `core.unsubscribe`.
- **`VerifyContext` likely needs the WebSub `mode` and the chosen lease** (to send
  `hub.mode` / `hub.lease_seconds` / `hub.topic` on the challenge GET). Thread these
  through `VerifyContext` or read them from `subscription.details` — decide in the
  verify slice.
- **Public hub URL is a host concern** (per `config.ts`: host concerns excluded from
  `RssCloudConfig`). Only the plugin's `deliver()` needs it (for `Link rel="hub"`) — so
  inject `hubUrl` (plus signature algo, timeout, challenge generator) as **plugin**
  construction options in `apps/server/core.js`. The express factory **and** the
  dispatcher take only `{ core }`, exactly like `ping`/`pleaseNotify`/`rpc2`; the
  scheduler is a `createRssCloudCore` option (default in-process, injectable for tests),
  not an arg of either. Lease bounds *are* protocol-relevant → add them to
  `RssCloudConfig` alongside `ctSecsResourceExpire`.

### Files this will touch

- **core (new):** `protocols/websub-plugin.ts` (verify + deliver), `protocols/websub-dispatcher.ts` (`hub.*` parse/validate, branch on `hub.mode`, drive the accept seam).
- **core (changed):** the verification-dispatch seam + async-accept entry on the engine; `PingRequest`/`detectChange` optional pushed content (fat ping); verified-unsubscribe path; `RssCloudConfig` lease bounds; `VerifyContext` WebSub fields.
- **express (new):** `websub-middleware.ts` — `websub({ core })` factory (same `{ core }` shape as `ping`/`pleaseNotify`/`rpc2`) delegating to core's `websub-dispatcher`; export from `index.ts`.
- **apps/server (the integration that makes e2e runnable):** `core.js` — add `createWebSubProtocolPlugin({ hubUrl, requestTimeoutMs, signatureAlgo, createChallenge })` to the `plugins` array (registers the `'websub'` protocol; without it `core.subscribe` → `UNSUPPORTED_PROTOCOL`) and feed lease bounds into `resolveConfig`; `controllers/index.js` — `router.post('/websub', websub({ core }))`; `config.js` — new env vars (hub URL, mount path, lease bounds, signature algo). Scheduler defaults inside `createRssCloudCore`, so no extra server wiring.
- **apps/e2e:** mock subscriber callback that echoes `hub.challenge`; handshake/publish/signature suites (copy any new helper into `helpers/`, don't cross the workspace boundary).
- **docs:** ADR for the async/best-effort+seam decision; `CONTEXT.md` vocabulary (Hub, Topic, Callback, Intent verification, Lease, Content distribution, Fat ping, `X-Hub-Signature`).

### e2e strategy (the TDD outer loop)

Every new endpoint/flow gets an `apps/e2e` acceptance test **written as the outer red of
its slice** — the HTTP-level test fails first, the core/express units make it green; the
slice isn't done until its e2e passes. e2e drives the running server over `APP_URL`; per
CLAUDE.md, anything new a test needs goes in `apps/e2e/test/helpers/` (copied, **not**
imported across the workspace boundary).

A reusable **mock WebSub subscriber** (alongside the existing rssCloud mock servers on
8002/8003) is grown incrementally as phases need it:
- **challenge-echo** (Phase 1): answers the intent-verification GET by echoing
  `hub.challenge` with `2xx`; a toggle to *refuse* (wrong/absent echo) drives the negatives.
- **content-capture** (Phase 2): records each distribution POST — body, `Content-Type`,
  `Link` rels — for assertions.
- **signature-verify** (Phase 3): recomputes `HMAC-SHA256(secret, body)` and checks
  `X-Hub-Signature`.

Flows that must have an e2e (happy path + the ★ negatives):
- **subscribe** → `202`, callback verified, sub recorded; ★ no-echo → **not** recorded;
  ★ malformed `hub.*` → `4xx`.
- **cross-protocol fan-out** — one rssCloud `/ping` fires BOTH an rssCloud sub and a
  WebSub sub on the same topic (the headline proof; see S2.2).
- **authenticated delivery** — subscriber validates the signature; ★ no `hub.secret` →
  no header.
- **unsubscribe** → verified removal; ★ no-echo → **not** removed.
- **leases** — requested value clamped + echoed in the verification GET; expiry via
  `removeExpired()`.
- **WebSub-native publish** (`hub.mode=publish`) and **fat ping** each deliver content.

### Slices (TDD vertical slices, red→green, in order)

**Phase 0 — Foundations**
- [x] **S0.1** ADR: WebSub hub = async-`202` intent verification via an in-process
  best-effort `VerificationScheduler` seam; persisted queue + retry is a future refactor
  behind the same seam. Record the lease + signature decisions too.
  (→ `docs/adr/0002-websub-async-intent-verification-seam.md`)
- [x] **S0.2** `CONTEXT.md`: add the WebSub vocabulary above (tie "Hub" to the existing
  Hub-end note; distinguish **Topic** from **Resource**, **Callback** from
  **Subscription.url**).

**Phase 1 — Subscribe happy path (async handshake; no secret/lease/content yet)**
- [x] **S1.1** `websub-dispatcher` param parse/validate: `hub.mode`, `hub.callback`
  (valid absolute URL), `hub.topic` (present) → malformed returns `{status:400}`; a valid
  subscribe builds a `websub` `SubscribeRequest` **directly** (`callbackUrl=hub.callback`,
  `resourceUrls=[hub.topic]`, not via `buildSubscribeRequest`). Pure unit tests, no network.
  (→ `packages/core/src/protocols/websub-dispatcher.ts`: `parseSubscribe`)
- [ ] **S1.2** `websub-plugin.verify()`: challenge GET to the callback with `hub.mode`,
  `hub.topic`, `hub.challenge`; require `2xx` and an exact `hub.challenge` echo, else
  throw (always verifies — ignores `diffDomain`). Injected `fetch` + challenge generator.
  `protocols: ['websub']`.
- [ ] **S1.3** `VerificationScheduler` as a `createRssCloudCore` option (default
  in-process: run task next tick, catch+log; injectable for tests) + an engine
  async-accept method `acceptSubscription(req)` that returns immediately and schedules
  verify→persist via the scheduler: success persists a `protocol:'websub'` subscription
  (with `details`), failure records nothing. `core.subscribe` is unchanged — the accept
  method is a new caller of it. Unit test drains a capturing scheduler.
- [ ] **S1.4** core `websub-dispatcher` ↔ express `websub({ core })` factory (same shape
  as `ping`/`pleaseNotify`): parse the form body, `hub.mode=subscribe` → `core.accept…`
  → `202`, malformed → `4xx`. Mirror `rest-middleware` (thin; dispatcher owns logic).
  Export from `index.ts`. (No `scheduler`/`hubUrl` args — see architecture notes.)
- [ ] **S1.5** Server integration (prerequisite for the S1.6 e2e):
  **(a)** `apps/server/core.js` — add `createWebSubProtocolPlugin({ hubUrl,
  requestTimeoutMs })` to the `plugins` array (registers `'websub'`; otherwise
  `core.subscribe` rejects it).
  **(b)** `apps/server/controllers/index.js` — `router.post('/websub', websub({ core }))`.
  **(c)** `apps/server/config.js` — env for the hub's public base URL (`HUB_URL`,
  default derived from `DOMAIN`/`PORT`) and mount path (`WEBSUB_PATH`, default `/websub`).
  (Lease bounds + signature algo are added in Phases 5/3 when their slices need them.)
- [ ] **S1.6** e2e (**establishes the reusable mock subscriber harness** — challenge-echo):
  POST subscribe → `202`, callback receives the verification GET, then **poll**
  `/subscriptions.json` (already lists every sub incl. `protocol:'websub'`) until the
  record appears — verification is async, so the test waits rather than asserting inline;
  ★ callback refuses to echo → record never appears (bounded timeout); ★ malformed
  `hub.*` (missing callback/topic, bad mode) → `4xx`.

**Phase 2 — Content distribution via the existing rssCloud ping (THE PAYOFF)**
> Proves the primary use case: an rssCloud-only publisher's `/ping` fans content out to
> WebSub subscribers. No WebSub publish path — relies on core's resource-keyed fan-out.
- [ ] **S2.1** `websub-plugin.deliver()`: POST `payload.body` to the callback, relaying
  the topic's `Content-Type = payload.contentType` **verbatim** (xml/atom/json/etc. — the
  hub is content-type-agnostic; `payload.contentType` is `string | null`, so pick a
  fallback like `application/octet-stream` when the origin sent none), plus
  `Link: <hubUrl>; rel="hub", <topic>; rel="self"`. No signature yet. Inject `hubUrl`.
  Unit tests with injected `fetch` (cover the present-and-null content-type branches).
- [ ] **S2.2** e2e (**the killer test** — extends the harness with content-capture):
  put an rssCloud subscriber **and** a WebSub subscriber on the same topic `T`, then hit
  the *existing* rssCloud `/ping` for `T` with changed content; assert **both** fire from
  that single ping — the rssCloud sub gets its notify, the WebSub callback gets a POST
  carrying the feed body + relayed `Content-Type` + `Link` rels. No `hub.mode=publish`
  involved — this is the headline "free WebSub for rssCloud publishers" cross-protocol
  proof.

**Phase 3 — Authenticated distribution (HMAC-SHA256)**
- [ ] **S3.1** parse + store `hub.secret` in `details` at subscribe. **S3.2** when
  `details.secret` present, add `X-Hub-Signature: sha256=HMAC(secret, body)`; algorithm a
  configurable plugin option (default `sha256`); no secret → no header. **S3.3** e2e:
  subscriber verifies the signature over the rssCloud-ping-delivered body.

**Phase 4 — Unsubscribe (intent-verified)**
- [ ] **S4.1** plugin verify for `hub.mode=unsubscribe` (shared verify keyed by mode).
  **S4.2** verified-unsubscribe path: scheduled task verifies intent then
  `core.unsubscribe` (which has no verify hook today). **S4.3** dispatcher/express branch
  `hub.mode=unsubscribe` → `202`. **S4.4** e2e unsubscribe handshake.

**Phase 5 — Leases (honor requested, clamped)**
- [ ] **S5.1** `RssCloudConfig` lease bounds (default/min/max secs) + resolve defaults.
  **S5.2** parse `hub.lease_seconds`, clamp, store `details.leaseSeconds`,
  `whenExpires = now + chosen`; echo the chosen lease in the verification GET (thread the
  chosen value into `verify`). **S5.3** e2e: requested lease clamped + echoed; expiry via
  `removeExpired()`.

**Phase 6 — WebSub-native publish front door (secondary — pure-WebSub publishers)**
- [ ] **S6.1** dispatcher/express `hub.mode=publish` (thin: `hub.url`/`hub.topic`) →
  `core.ping(topic)` → `2xx`/`204`. Lets a publisher with *no* rssCloud ping trigger the
  same fan-out. Reuses everything from Phase 2. **S6.2** e2e: WebSub publish → WebSub
  subscriber receives content.

**Phase 7 — Fat pings (secondary — publisher pushes the body)**
- [ ] **S7.1** decide + document the (non-standard) fat-ping wire format — topic via
  param/header, raw body, and how to tell it from a thin publish (see open questions).
  **S7.2** `PingRequest` optional pushed content; `detectChange` uses it instead of
  fetching (still hashes for change detection). **S7.3** express publish detects a fat
  ping → `core.ping` with pushed content → distributed verbatim. **S7.4** e2e fat ping.

**Phase 8 — Hardening / spec niceties (deferred, optional)**
- [ ] `hub.mode=denied` callback notification on verification/validation failure.
- [ ] Persisted verification queue + retry (the seam refactor) — its own ADR/project.
- [ ] Publisher-facing docs: advertising the hub via `<link rel="hub">`.
- [ ] [websub.rocks](https://websub.rocks/) hub-conformance pass.

*Coverage:* `packages/` stays at **100%** — every branch in the plugin, dispatcher, and
seam needs a test (or an explicit, justified ignore). e2e covers the integration.

### Open questions (carry into the relevant slice)

- **Fat-ping wire format (S7.1):** WebSub has no standard fat ping (it was a
  PubSubHubbub 0.4 extension). Decide how a publisher indicates the topic when pushing a
  body — a query/`hub.topic` param alongside a raw body, a `Content-Location`/`Link`
  header, etc. — and how to distinguish it from a thin `hub.mode=publish`.
- **Resource pre-read on subscribe:** `core.subscribe` pre-pings the resource; WebSub
  subscribe may skip that (the spec only requires intent verification). Decide when
  wiring the accept path.
- **Seam ownership:** confirm the `VerificationScheduler` is core-owned (so a future
  persisted queue lives next to the store) vs. injected from the composition root.
