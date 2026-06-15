# rssCloud over XML-RPC

The same rssCloud operations as the [REST front door](rsscloud-rest.md), spoken as
XML-RPC method calls. Everything is handled at a single endpoint:

**`POST /RPC2`** — send an XML-RPC `methodCall` with `Content-Type: text/xml`. The
response is an XML-RPC `methodResponse`, also `text/xml`.

Three methods are recognised.

## rssCloud.hello

A connectivity check. No parameters; always returns boolean `true`.

```xml
<methodResponse><params><param><value><boolean>1</boolean></value></param></params></methodResponse>
```

## rssCloud.pleaseNotify

Register a callback for one or more resources. Six positional parameters, in order:

| # | Parameter         | Type            | Meaning                                                              |
| - | ----------------- | --------------- | -------------------------------------------------------------------- |
| 1 | `notifyProcedure` | string          | The XML-RPC method the server calls on your callback (e.g. `rssCloud.notify`). Used for the `xml-rpc` protocol. |
| 2 | `port`            | int (`i4`)      | Port of your callback.                                               |
| 3 | `path`            | string          | Path of your callback.                                              |
| 4 | `protocol`        | string          | `http-post`, `https-post`, or `xml-rpc`.                            |
| 5 | `urlList`         | array of string | The resource URL(s) to watch.                                       |
| 6 | `domain`          | string          | Optional callback host; omit (or pass empty) to use the caller's address. |

Parameters 1–5 are required (5 or 6 params total). On a successful, verified
subscription the response is boolean `true`. A subscription failure or a malformed
call returns a **fault** (see [Faults](#faults)).

## rssCloud.ping

Announce that a resource changed. One positional parameter:

| # | Parameter     | Type   | Meaning                        |
| - | ------------- | ------ | ------------------------------ |
| 1 | `resourceUrl` | string | The resource URL that changed. |

As in the rssCloud reference implementation, `rssCloud.ping` returns boolean `true`
whenever the call is **well-formed** — even if the re-fetch or fan-out later fails. Only a
malformed call (wrong number of parameters) returns a fault. As with REST, a
well-formed ping triggers a re-fetch and, on a real change, a fan-out to every
subscriber regardless of protocol (see [How it fits together](cross-protocol.md)).

## Faults

Errors are returned as a standard XML-RPC `fault`. rssCloud faults always use
`faultCode` `4`; the `faultString` carries a human-readable explanation.

```xml
<methodResponse>
  <fault><value><struct>
    <member><name>faultCode</name><value><int>4</int></value></member>
    <member><name>faultString</name><value><string>Can't make the call because "rssCloud.frobnicate" is not defined.</string></value></member>
  </struct></value></fault>
</methodResponse>
```

---

← [Back to the documentation index](../README.md)
