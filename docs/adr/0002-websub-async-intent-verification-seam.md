# WebSub intent verification is async-202 behind a best-effort VerificationScheduler seam

The [WebSub](https://www.w3.org/TR/websub/) spec mandates that a hub confirm a
subscriber's intent before recording a (un)subscribe: the hub GETs the subscriber's
`hub.callback` carrying `hub.mode` / `hub.topic` / `hub.challenge` and requires an exact
`hub.challenge` echo with a `2xx`. The spec lets the hub do this synchronously (`2xx`)
*or* asynchronously (`202 Accepted`, verify out of band). This ADR records that we take
the async-`202` route, the seam it hides behind, and two adjacent settled decisions
(lease handling and delivery signatures) made the same day.

## Status

accepted

## Decision

1. **Async `202`.** The `hub.*` dispatcher validates the request *synchronously*
   (malformed → `4xx`), returns `202 Accepted`, and only then performs the
   `hub.challenge` GET out of band, recording the `protocol:'websub'` subscription on a
   successful echo and recording nothing on failure. This keeps the inbound request fast
   and decouples the subscriber's HTTP round-trip from our outbound verification.

2. **One verification-dispatch seam; in-process best-effort now, persisted queue later.**
   Async ≠ a durable queue. A single seam — a `VerificationScheduler` — runs the
   verify-then-persist task. The default implementation runs it **in-process, one
   attempt, failures logged**; a restart mid-flight simply drops the pending request and
   the subscriber re-subscribes (WebSub subscribers are expected to renew). A future
   persisted-queue + retry implementation satisfies the *same* seam — draining on the
   existing maintenance interval and persisting through the store — with **no change** to
   the `hub.*` dispatcher, the plugin's `verify()`, or the express factory.

3. **The scheduler is core-owned, additive, and WebSub-only.** It is a
   `createRssCloudCore` option (default in-process, injectable for tests), not an argument
   of the dispatcher or the express factory. It lives in core — not express — only so the
   future persisted queue can reach the store; the in-process default would work
   anywhere. rssCloud `pleaseNotify` / `subscribe` stays **synchronous** (its callers
   expect an immediate yes/no), and `ping` / `fanOut` / `deliver` are untouched. The
   async-accept path is a brand-new caller of an unchanged `core.subscribe`, so no
   existing rssCloud behaviour changes.

4. **Lease = honor requested, clamped.** The hub uses the subscriber's
   `hub.lease_seconds` clamped to a configurable `[min, max]` (a default applies when the
   subscriber omits it), stores the chosen value in `details.leaseSeconds`, sets
   `whenExpires = now + chosen`, and echoes the chosen value in the verification GET. The
   existing `removeExpired()` drops the subscription on lapse, unchanged. Lease bounds are
   protocol-relevant, so they belong in `RssCloudConfig` alongside `ctSecsResourceExpire`.

5. **Signature = HMAC-SHA256, configurable.** When a subscriber supplies a `hub.secret`,
   each content delivery is signed with `X-Hub-Signature: sha256=…` (the algorithm is a
   plugin config knob, default `sha256`). No `hub.secret` → no signature header.

## Why a seam rather than committing to a queue now

The headline use case — free WebSub content distribution for publishers already pinging
this server over rssCloud — needs none of the durability a persisted queue buys: it rides
the existing resource-keyed fan-out, where the WebSub `deliver()` is just another plugin.
Only the *subscribe/unsubscribe handshake* is async, and a dropped handshake is
self-healing (the subscriber retries). Building the persisted queue up front would be
speculative complexity; refusing to leave room for it would be a trap. A seam is the
cheap middle: it lets the best-effort default ship now and the durable implementation
land later as a pure substitution, captured here so the substitution isn't mistaken for
a behavioural change.

## Consequences

- A subscriber's `202` does **not** mean "subscribed" — only "request accepted; intent
  verification pending". The e2e suite therefore **polls** `/subscriptions.json` until the
  record appears (or a bounded timeout proves it never will), rather than asserting inline.
- A process restart between `202` and a successful challenge GET loses that pending
  request with no record anywhere. Acceptable under best-effort; the subscriber
  re-subscribes. The future persisted-queue implementation removes this window.
- `core.unsubscribe()` has no verify hook today. A verified WebSub unsubscribe must run
  the `hub.mode=unsubscribe` challenge GET through the **same** scheduler before calling
  `core.unsubscribe` — the verification belongs to the scheduled task, not to
  `core.unsubscribe` itself.
