# How it fits together

The server speaks three notification dialects — [rssCloud over REST](rsscloud-rest.md),
[rssCloud over XML-RPC](rsscloud-xml-rpc.md), and [WebSub](websub.md) — but underneath
they are **one hub over one subscriber list**. The headline consequence:

> A publisher sends **one** signal, and **every** subscriber to that resource is
> notified — no matter which protocol each of them subscribed with.

## One signal, three doors

A change can be announced three ways, and all of them converge on the same internal
routine:

| Publisher sends                     | Front door     |
| ----------------------------------- | -------------- |
| `POST /ping` (form `url`)           | rssCloud REST  |
| `rssCloud.ping` (`resourceUrl`)     | rssCloud XML-RPC |
| `POST /websub` with `hub.mode=publish` | WebSub      |

Each one hands the hub a resource URL and triggers the same sequence.

## What the hub does

1. **Re-fetch** the resource once.
2. **Detect change** — the hub hashes the body (and tracks its size). If neither the
   hash nor the size differs from the last time it looked, nothing is sent. (A
   resource the hub has never seen before counts as changed, so its first ping fans
   out.)
3. **Fan out** — the hub loads *all* active subscriptions for that resource and
   delivers to each one using the delivery method that subscription registered with.

That third step is the whole point: the subscriber list is keyed by resource, not by
protocol. Each subscription carries a `protocol`, and the hub picks the matching
delivery for it:

| Subscription `protocol` | How that subscriber is notified                              |
| ----------------------- | ------------------------------------------------------------ |
| `http-post`             | HTTP `POST` to the callback with a `url` parameter           |
| `https-post`            | the same over HTTPS                                          |
| `xml-rpc`               | an XML-RPC `notify` call to the callback                     |
| `websub`                | HTTP `POST` of the full feed body, with `Link` and optional `X-Hub-Signature` |

## Why this matters

You don't have to care which protocol your subscribers chose, and they don't have to
care which one your publisher speaks:

- A publisher that speaks **rssCloud** (a `/ping`) still notifies **WebSub**
  subscribers.
- A publisher that speaks **WebSub** (`hub.mode=publish`) still notifies **rssCloud**
  subscribers.

The protocol is a per-subscriber delivery detail. The change signal is shared.

---

← [Back to the documentation index](../README.md)
