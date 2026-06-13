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

> **Done (history in git):**
> - **Sealed the `core.store` port** — `RssCloudCore` exposes a narrow
>   `listFeeds()` read seam plus `seedResource()` / `seedSubscriptions()` /
>   `clearFeeds()` for the test API; `readonly store` is gone from the
>   interface. All state access is concentrated in core.
> - **Opened the HTTP-edge seam** — controllers are a
>   `createControllers({ core })` factory, so importing them no longer boots a
>   `FileStore`. The near-identical `res.render` shells (`home`, `ping-form`,
>   `please-notify-form`) collapsed into a table-driven mount, and `/docs` +
>   `/LICENSE.md` share one `renderMarkdownDoc` service. HTTP behaviour stays
>   covered by the e2e suite (no new HTTP-level unit tests, by decision).
> - **Lifted the maintenance jobs out of `create-core.ts`** — `removeExpired`
>   and `generateStats` now live in `engine/maintenance.ts` as functions over
>   `(store, config, now)`; the factory delegates. Shrank the factory ~143
>   lines and the maintenance suite exercises them directly against an
>   in-memory store (one core-level smoke test per delegation). Coverage 100%.
> - **Collapsed the three `fetchWithTimeout` copies** — the abort/`clearTimeout`
>   dance now lives in one `fetchWithTimeout(doFetch, ms, url, init)` at the
>   package root; the engine and both protocol plugins delegate. One home, one
>   fake-timer test suite (abort-on-timeout + clear-on-settle). Coverage 100%.

### 1. `feedsChangedLast7Days` label can silently lie

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
