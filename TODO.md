# TODO — rsscloud-server: open work

Outstanding + future work only. The `apps/server` → `@rsscloud/core` migration and
the on-disk **v2 format unification** (disk == domain model; `legacy-store-shape.js`
deleted; one-way legacy importer in `file-store.ts`) are both done — their history
lives in git (`feat(core):` / `refactor(server):` commits), not here. Per CLAUDE.md:
build with the `tdd` skill (red-green vertical slices); Conventional Commits enforced.
Architecture decisions are recorded in `docs/adr/`; domain vocabulary in `CONTEXT.md`.

## Architecture cleanup (deepening opportunities)

From an architecture review (2026-06-12). Ordered by payoff. Vocabulary: a
**shallow** module's interface is nearly as complex as its implementation; a
**deep** one hides a lot of behaviour behind a small interface; a **seam** is a
place behaviour can be swapped without editing in place; **leakage** is one
module's internals crossing a seam into another. File/line refs will drift —
trust the names over the numbers.

### 1. Seal the `core.store` port (the keystone)

`Store` is injected *into* the engine, then re-exposed *out* of it
(`core/engine/core.ts` `readonly store`, re-exported by `apps/server/core.js`).
That leak lets the read side reach past the engine to touch state directly:
`controllers/index.js` (`/subscriptions.json`), `services/feeds-json.js`,
`services/feeds-opml.js`, the whole `/test/*` API in `controllers/test.js`, and
even core's own tests (`core.store.list()`).

*Fix:* give `RssCloudCore` a narrow read seam — `listFeeds()` snapshot plus a
`seedResource()` for the test API — and drop `readonly store` from the
interface. Concentrates all state access in one module. Unblocks #2 (the
injectable in-memory core).

### 2. Open a test seam at the HTTP edge

Controllers `require('../core')` at module load, so importing any one boots a
real `FileStore` — no controller has a test. Four (`home`, `ping-form`,
`please-notify-form`, `docs`) are near-identical `res.render` shells, and the
`/LICENSE.md` route re-inlines what `docs.js` already does.

*Fix:* a `createControllers({ core })` factory mirroring the testable services
(`feeds-opml`, `stats`, etc.), plus a table-driven mount for the render-only
routes. Two adapters justify the seam: prod core and an in-memory core in tests.

### 3. Lift the maintenance jobs out of `create-core.ts`

`removeExpired` and `generateStats` (~130 lines inside the 585-line factory) are
read-only jobs needing only `store` + a clock, but are exercisable only by
building a full core with fetch + plugin mocks they never use.

*Fix:* extract as functions over `(store, config, now)`; core delegates. Narrows
the test surface; shrinks the factory. (Coverage stays 100% per CLAUDE.md.)

### 4. One `fetchWithTimeout`, not three copies

The abort-controller + `clearTimeout` pattern is written verbatim in
`engine/create-core.ts`, `protocols/rest-plugin.ts`, and
`protocols/xml-rpc-plugin.ts`; only the timeout source differs.

*Fix:* a shared `fetchWithTimeout(doFetch, ms, url, init)` core util. A bug in
the abort dance then has one place to live, and one place to test.

### 5. `feedsChangedLast7Days` label can silently lie

The window is a config value upstream (`feedsChangedWindowDays`) but a baked-in
literal `7` downstream: the wire field name in `services/stats.js`
(`toLegacyStats`) and the wording in `views/stats.handlebars`. Change the config
and the label keeps claiming "7 days".

*Fix:* carry the window count through the projection (`feedsChangedLastWindow` +
`windowDays`) and let the template interpolate it.

> The review's sixth item — extracting the hand-rolled wire builders out of
> `apps/server/client.js` — is already the "Client app + `@rsscloud/client`
> package" work below. Not duplicated here.

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

## Client app + `@rsscloud/client` package (bigger)

Pull `apps/server/client.js` into two layers, mirroring how `apps/server` consumes
`@rsscloud/core`. It already works against the live server — this is extraction +
packaging, not a behaviour change.

*`@rsscloud/client` (`packages/client`)* — the **subscriber+publisher end** of the
protocol (core is the hub end); reusable + published:
- **Subscriber:** send `pleaseNotify` (REST + XML-RPC), do the http-post challenge
  echo, receive/parse notifications (http-post + XML-RPC `rssCloud.notify`).
- **Publisher:** send `ping` (REST + XML-RPC); optional helper to emit a feed with the
  `<cloud>` element. The wire builders inline in `client.js` today move here.

*`apps/client` (private, like `apps/e2e`)* — the interactive dev harness on the
package: the existing Express UI (Subscribe/Ping controls + request log, serving test
feeds). The manual counterpart to the automated e2e.

*Notes:*
- **Wire format** is now known in core (hub side) and the e2e helpers; decide a shared
  module vs. independent reimplementation in the client (leaning independent, per the
  keep-e2e-independent convention).
- **WebSub-ready:** grows a WebSub subscriber/publisher once that lands.
- **Workspace:** `apps/client` private (not release-tracked); `packages/client`
  release-tracked + 100% coverage, like `@rsscloud/core`.

*First slice:* lift the wire builders + subscribe/ping calls into `packages/client`
with tests, thin `client.js` to a UI shell on the package, then relocate it to
`apps/client`.
