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
