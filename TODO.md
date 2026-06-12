# TODO — rsscloud-server: open work

Outstanding + future work only. The `apps/server` → `@rsscloud/core` migration is
done; its history lives in git (`refactor(server):` commits), not here. Per
CLAUDE.md: build with the `tdd` skill (red-green vertical slices); Conventional
Commits enforced. Architecture decisions are recorded in `docs/adr/`; domain
vocabulary in `CONTEXT.md`.

## Small follow-ups (optional, none blocking)

- [ ] **Unify the on-disk format with the domain model** (versioned-file migration).
      Two layers do the same legacy↔core translation today —
      `packages/core/.../file-store.ts` (disk↔core) and
      `apps/server/services/legacy-store-shape.js` (legacy-wire↔core, for `/test/*` +
      `/subscriptions.json`). Persisting core's model instead **deletes
      `legacy-store-shape.js`**, moves `/subscriptions.json` + the e2e `/test/*`
      helpers onto the core model, and drops the per-read mapping in `list()` /
      `getResource()` (in-memory becomes the core model directly). `file-store.ts` is
      left doing only date (de)serialization + a one-way legacy importer.

      The three service unit tests (`stats` / `feeds-opml` / `remove-expired`) already
      build injected in-memory cores and seed the core model directly, so
      `controllers/index.js` (`/subscriptions.json`) and `controllers/test.js`
      (`/test/*`) are now the only remaining `legacy-store-shape.js` consumers.

      *Migration flow (self-completing, no manual step):*
      - Load precedence: `subscriptions.v2.json` → `subscriptions.v1.json` /
        `subscriptions.json` (legacy, **converted** on load) → empty.
      - All writes go to `subscriptions.v2.json`; the legacy file is never rewritten
        (left as a "new format exists" signal + pre-migration backup). Future boots
        read v2 directly.
      - The converter already exists — `file-store.ts`'s current `readResource` /
        `readSubscription` (legacy→core) become the v1 import path; only the *writer*
        flips to v2. Keep the v1 importer until a later major drops it.
      - Config: derive paths from `DATA_FILE_PATH` (write `…/subscriptions.v2.json`,
        fall back to `.v1.json` / the bare name). Log once on migration.

      *Caveat:* forward-only — once v2 runs, the legacy file goes stale, so rolling
      back to old code loses post-migration writes. If both exist, v2 wins (document
      it).

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
subscription fields ride better on the domain-model disk format — do the unify
follow-up first.

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
