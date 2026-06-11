# rssCloud Server

The notification context of the [rssCloud](http://rsscloud.org/) protocol: subscribers
register a callback for a feed, publishers signal when a feed changes, and the server
fans notifications out to subscribers. `@rsscloud/core` is the protocol-neutral engine
(the **hub** end); the transports and HTTP edge wrap it.

## Language

**Resource**:
A feed or document the server watches, together with its change-detection state
(last hash, size, check/update counts). One per feed URL.
_Avoid_: feed (reserve "feed" for the parsed metadata on a resource), document, page.

**Subscription**:
A subscriber's standing request to be notified when a **Resource** changes — its
callback URL, protocol, error counters, and expiry. Many per **Resource**.
_Avoid_: subscriber (that's the remote party), registration, listener.

**Feed entry**:
One **Resource** plus its **Subscription**s — the unit the store reads and writes.
_Avoid_: record, row, document.

**Ping**:
A publisher's change signal for a **Resource** (`/ping`, `rssCloud.ping`). Triggers a
re-fetch, change detection, and fan-out. Always answered with success once well-formed.
_Avoid_: notify (that's the outbound direction), update, poke.

**pleaseNotify**:
A subscriber's call to establish or renew a **Subscription** (`/pleaseNotify`,
`rssCloud.pleaseNotify`). Distinct from the outbound notification it sets up.
_Avoid_: subscribe request (the verb is "pleaseNotify"; `SubscribeRequest` is the DTO it maps to).

**Front door**:
An HTTP entry point a remote party calls — `/ping`, `/pleaseNotify`, `/RPC2`. The same
use case (subscribe, ping) is reachable through more than one front door.
_Avoid_: endpoint, route, controller.

**Dispatcher**:
The wire-protocol adapter behind a **Front door** (REST or XML-RPC). It parses the
request off its transport, drives **core**, and renders the response in that
transport's voice — including the exact legacy wording. core speaks error *codes*;
the dispatcher chooses the *words* (wire-parity convention).
_Avoid_: handler, controller, parser.

**SubscribeParams**:
The wire-neutral fields a **Dispatcher** has already pulled off its transport
(`resourceUrls`, `port`, `path`, `protocol`, `clientAddress`, optional `domain` /
`notifyProcedure`) — the input to **buildSubscribeRequest**. Not yet a `SubscribeRequest`.
_Avoid_: SubscribeRequest (that's the assembled DTO core consumes), raw body, fields.

**buildSubscribeRequest**:
The single deep assembler shared by both **Dispatcher**s: takes **SubscribeParams** and
produces a `SubscribeRequest` — validating the protocol, deriving the scheme, gluing the
callback URL (`::ffff:` strip, IPv6 bracketing, path slash), resolving `diffDomain`, and
gating `notifyProcedure`. The one place the callback-URL assembly rules live.
_Avoid_: mapper, glueUrlParts (that's one step inside it).

**Protocol plugin**:
The delivery adapter for a notification protocol (`http-post`, `https-post`, `xml-rpc`):
verifies a new **Subscription** and delivers notifications. Selected by the
**Subscription**'s protocol.
_Avoid_: transport, notifier, driver.

**diffDomain**:
A **Subscription** whose callback host differs from the caller's address, requiring the
challenge handshake at verify time. Set by **buildSubscribeRequest** from the presence of
an explicit `domain`.
_Avoid_: cross-origin, external, remote.

## Example dialogue

> **Dev:** When a `pleaseNotify` comes in over XML-RPC, who decides the callback is `diffDomain`?
> **Domain expert:** The dispatcher just pulls the positional params into **SubscribeParams** and hands them to **buildSubscribeRequest**. The builder is the one that sees an explicit `domain`, sets `diffDomain`, and glues the callback URL. Same builder the REST front door uses.
> **Dev:** So if the protocol's unsupported, that's the builder too?
> **Domain expert:** Right — protocol validation moved inside the builder, so both front doors fault the same way. The dispatcher only owns its own wire's presence check and the wording it renders back.
