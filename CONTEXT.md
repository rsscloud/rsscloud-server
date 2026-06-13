# rssCloud Server

The notification context of the [rssCloud](http://rsscloud.org/) protocol: subscribers
register a callback for a feed, publishers signal when a feed changes, and the server
fans notifications out to subscribers. `@rsscloud/core` is the protocol-neutral engine
(the **Hub** end); the transports and HTTP edge wrap it. `apps/client` is the matching
**Client** end (the **Subscriber** + **Publisher** side), and `@rsscloud/xml-rpc` is the
**XML-RPC codec** both ends share.

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

**Hub**:
The server end of the protocol: it answers **pleaseNotify** and **Ping**, owns the
**Resource**/**Subscription** state, and fans **Notification**s out. `@rsscloud/core` is the
protocol-neutral hub engine; `apps/server` is one deployment of it.
_Avoid_: server (that's a deployment of the hub, not the role), broker.

**Client**:
The **Subscriber** + **Publisher** end of the protocol — the mirror of the **Hub**,
living in `apps/client`. Its `lib/` builds the **pleaseNotify**/**Ping** calls (on the
**XML-RPC codec**) and renders a feed's **Cloud element**; the app hosts the callback
endpoint that answers the verify challenge and acknowledges **Notification**s. Not a
published package — a real subscriber must host that endpoint, so it stays app logic.
_Avoid_: agent, consumer, SDK.

**Subscriber**:
The remote party — and the **Client** role — that registers to be notified: sends
**pleaseNotify**, answers the verify challenge, and receives **Notification**s. Its callback
host is what the stats `uniqueAggregators` count.
_Avoid_: subscription (that's the stored record), listener, consumer.

**Publisher**:
The remote party — and the **Client** role — that signals a **Resource** changed: sends
**Ping** and advertises the **Cloud element** in its feed. One **Client** can be both
Subscriber and Publisher.
_Avoid_: feed (that's the parsed metadata on a **Resource**), source, producer.

**Notification**:
The outbound delivery from the **Hub** to a **Subscriber**'s callback when a **Resource**
changes — an `http-post` `url=` form or an XML-RPC `rssCloud.notify` call. What a
**Protocol plugin** sends and the **Client** receives and acknowledges.
_Avoid_: ping (that's the inbound publisher signal), pleaseNotify (the inbound subscribe),
message, event.

**Cloud element**:
The `<cloud>` element a **Publisher** places in its RSS feed (domain / port / path /
registerProcedure / protocol) telling a **Subscriber** where to **pleaseNotify**. Built by
the **Client**'s `renderCloudFeed`; the **Hub** doesn't host it — publishers reference the
hub from their own feeds.
_Avoid_: cloud (ambiguous on its own), hub link.

**XML-RPC codec**:
The generic XML-RPC `methodCall`/`methodResponse` encode + decode (`@rsscloud/xml-rpc`)
shared by the **Hub** and the **Client**. It speaks typed `XmlRpcValue`s and carries no
`rssCloud.*` semantics — each end maps its own method shapes onto it.
_Avoid_: parser (that's one half), serializer, XML library.

## Example dialogue

> **Dev:** When a `pleaseNotify` comes in over XML-RPC, who decides the callback is `diffDomain`?
> **Domain expert:** The dispatcher just pulls the positional params into **SubscribeParams** and hands them to **buildSubscribeRequest**. The builder is the one that sees an explicit `domain`, sets `diffDomain`, and glues the callback URL. Same builder the REST front door uses.
> **Dev:** So if the protocol's unsupported, that's the builder too?
> **Domain expert:** Right — protocol validation moved inside the builder, so both front doors fault the same way. The dispatcher only owns its own wire's presence check and the wording it renders back.

> **Dev:** The **Client** and the **Hub** both speak XML-RPC — do they share the builder?
> **Domain expert:** They share the **XML-RPC codec** (`@rsscloud/xml-rpc`), not each other's calls. The Client builds `rssCloud.pleaseNotify`/`rssCloud.ping`; the Hub parses those and sends a **Notification**. Each maps its own `rssCloud.*` shapes onto the codec's typed values.
> **Dev:** And how does a **Publisher** point a **Subscriber** at us?
> **Domain expert:** Via the **Cloud element** in the publisher's own feed — the Client's `renderCloudFeed` writes it. The Hub never hosts the feed; it just answers the **pleaseNotify** the subscriber sends after reading that `<cloud>`.
