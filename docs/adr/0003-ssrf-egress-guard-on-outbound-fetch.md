# Outbound fetches are screened by an SSRF egress guard pinned to the resolved IP

The hub fetches and delivers to URLs supplied by untrusted clients. A subscriber's
`hub.callback` (where WebSub content distribution **sends the fetched feed body**) and a
publisher's `hub.topic` / `hub.url` (which the hub **fetches**) are both attacker-controlled
and were validated only for shape (absolute URL / non-empty string). With WebSub content
distribution, that turned a pre-existing _blind_ fetch of an arbitrary URL into a _full-read_
SSRF: an attacker subscribes a callback they control, names an internal `hub.topic` (e.g.
`http://169.254.169.254/…`), and the hub relays the internal response body to the callback.
This ADR records the egress guard added to close it.

## Status

accepted

## Decision

1. **Deny by resolved IP, not by URL text.** A public hub must accept arbitrary public feed
   URLs, so an allowlist of topics is unworkable. Instead we enumerate the destinations the
   hub must never reach and refuse them: an outbound request is blocked when its host
   resolves to a non-public range (loopback, private, link-local incl. cloud-metadata
   `169.254.169.254`, IPv6 unique-local, CGNAT, unspecified) or its scheme is not
   `http`/`https`. Classification is on the resolved IP (via `ipaddr.js`), decoding
   IPv4-mapped IPv6 first, so a hostname that points inward — or an IP-literal in disguise —
   is caught.

2. **Rebinding-safe: pin the connection to the validated address.** The guard is a
   `createSafeFetch` wrapper over undici. A custom DNS lookup screens every resolved address
   and the connection is pinned to that address (undici does not re-resolve), and a custom
   connector screens IP-literal hosts (which skip DNS entirely). Both fire on every
   connection the dispatcher opens, so each **redirect hop** is re-screened and there is no
   resolve-then-connect TOCTOU window.

3. **One guard, injected on every outbound path.** `createSafeFetch` lives in
   `@rsscloud/core` and is injected as the `fetch` for the engine's topic re-fetch **and**
   every protocol plugin's deliveries / verification GETs. So topic fetch, the WebSub
   challenge GET, WebSub content delivery, and the rssCloud REST/XML-RPC notifies are all
   covered uniformly — the pre-existing rssCloud blind fetch is hardened for free.

4. **Secure by default, with trust-split operator escape hatches.** Protection is **on** by
   default (`WEBSUB_SSRF_PROTECTION`). The exemption allowlist is **split by trust** so a
   trusted-feed exemption can't reopen SSRF for callbacks: the topic-fetch path honors
   `WEBSUB_FETCH_ALLOW_CIDRS`, while the callback path (delivery + verification GET, both to
   attacker-supplied `hub.callback` URLs) is strict by default and honors only the separate
   `WEBSUB_CALLBACK_ALLOW_CIDRS`. The engine takes the topic policy (its sole outbound call
   is the feed re-fetch); the plugins take the callback policy (they only ever reach
   subscriber callbacks). Local dev and the e2e suite (whose targets are loopback / private
   Docker IPs) keep working by allowlisting those ranges on both paths — the e2e suite runs
   with protection on so the guarded fetch is exercised end-to-end.

## Why connector-level, not just a custom lookup

undici's `connect.lookup` hook is the obvious place to screen DNS, but it is **skipped for
IP-literal hosts** — undici connects straight to a literal address without resolving — so a
lookup-only guard lets `http://169.254.169.254/` (the headline payload) straight through.
Screening must therefore also happen at the connector, which runs for every connection
regardless of how the host was specified. The lookup handles hostnames (and pins their
resolved IP); the connector handles literals; together they cover the initial request and
every redirect.

## Consequences

- `@rsscloud/core` gains two runtime dependencies — `undici` (the Agent + connector needed to
  pin the socket; the same implementation as the platform's global `fetch`) and `ipaddr.js`
  (range classification). The guard is injected, so a consumer that never builds it pays only
  the install.
- A blocked request surfaces through existing error handling: the topic re-fetch reports a
  read failure (`RESOURCE_READ_FAILED`), and a blocked callback counts as a failed delivery
  (`notifyFailed`). Nothing new is thrown to the front door.
- A hub deployed on a network whose feeds live on private addresses must opt those ranges in
  via `WEBSUB_FETCH_ALLOW_CIDRS` (and, for subscribers on private addresses, separately via
  `WEBSUB_CALLBACK_ALLOW_CIDRS`), or those requests will be refused. This is the intended
  secure-by-default trade-off.
- The highest-value target is cloud instance metadata; operators should still defend it at
  the infrastructure layer too (e.g. IMDSv2 with a hop limit), so the guard is defence in
  depth rather than the only control.

## Amendment (2026-07-01)

Two refinements were made after this ADR was accepted, tightening decisions 3 and 4:

- **No full-off switch.** The `WEBSUB_SSRF_PROTECTION` toggle was removed. The guard is now
  always on; the only exemptions are the trust-split `WEBSUB_FETCH_ALLOW_CIDRS` /
  `WEBSUB_CALLBACK_ALLOW_CIDRS` allowlists. A loopback/private test setup allowlists the
  range (e.g. `127.0.0.0/8`) instead of disabling screening, so there is no longer a config
  path that reaches an unguarded global `fetch`.
- **Timeout folded into the guarded fetch.** The per-request outbound timeout, previously a
  separate `fetchWithTimeout` wrapper applied by the engine and each plugin (with a
  `requestTimeoutMs` option), now lives inside `createSafeFetch` as `timeoutMs`. Outbound
  callers hold a single fetch that is both SSRF-guarded and time-bounded, so neither
  protection can be applied without the other. `createSafeFetch` is the one outbound object;
  the plugins/engine no longer take `requestTimeoutMs`.
