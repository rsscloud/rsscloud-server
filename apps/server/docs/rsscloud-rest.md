# rssCloud over REST

The rssCloud protocol spoken as plain `application/x-www-form-urlencoded`
HTTP POSTs. Subscribers register a callback with [`POST /pleaseNotify`](#post-pleasenotify);
publishers announce a change with [`POST /ping`](#post-ping). The same notifications
can also be driven [over XML-RPC](rsscloud-xml-rpc.md), and a single ping reaches
subscribers of **every** protocol — see [How it fits together](cross-protocol.md).

## POST /pleaseNotify

Tell the server you want to be notified when one or more resources (feeds) change.

The form parameters are:

| Parameter            | Required | Meaning                                                                 |
| -------------------- | -------- | ----------------------------------------------------------------------- |
| `protocol`           | yes      | How the server should notify you: `http-post`, `https-post`, or `xml-rpc`. |
| `port`               | yes      | Port of your callback.                                                  |
| `path`               | yes      | Path of your callback.                                                  |
| `url1`, `url2`, … `urlN` | yes  | The resource URL(s) you want to watch. For a feed, its URL.             |
| `domain`             | no       | Your callback host. If omitted, the server uses the requesting IP address. |
| `registerProcedure`  | no       | Accepted for spec compatibility but ignored (only meaningful for XML-RPC/SOAP). |

`https-post` is identical to `http-post` except notifications are sent over HTTPS.
As a convenience, `http-post` with `port` 443 is also notified over HTTPS; for any
other HTTPS port, use `https-post`.

### How the subscription is verified

Before recording the subscription, the server confirms your resource URLs return an
HTTP 2xx, then proves your callback works — in one of two ways:

1. **No `domain` given (IP-based).** The server `POST`s to `http://<ip>:<port><path>`
   with a single `url` parameter. Reply with any 2xx to accept.
2. **`domain` given (challenge).** The server `GET`s
   `http://<domain>:<port><path>?url=<resource>&challenge=<token>`. Reply 2xx **and**
   echo the `challenge` value verbatim as the body to accept.

### Response

Two values are returned: `success` (`true`/`false`) and `msg` (a human-readable
explanation). The default content type is `text/xml`; send `Accept: application/json`
for JSON.

```xml
<?xml version="1.0"?>
<notifyResult success="false" msg="The subscription was cancelled because the call failed when we tested the handler."/>
```

```json
{
    "success": false,
    "msg": "The subscription was cancelled because the call failed when we tested the handler."
}
```

## POST /ping

Tell the server a resource has been updated.

| Parameter | Required | Meaning                      |
| --------- | -------- | ---------------------------- |
| `url`     | yes      | The resource URL that changed. |

The server re-fetches the URL and, **only if the content actually changed**, fans the
notification out to every subscriber of that resource (see
[How it fits together](cross-protocol.md)). The default content type is `text/xml`;
send `Accept: application/json` for JSON.

```xml
<?xml version="1.0"?>
<result success="true" msg="Thanks for the ping."/>
```

```json
{ "success": true, "msg": "Thanks for the ping." }
```

## Browser helpers

- **`GET /pleaseNotifyForm`** — an HTML form for subscribing from a browser.
- **`GET /pingForm`** — an HTML form for pinging from a browser.
- **`GET /viewLog`** — a live log of recent server events, handy when debugging your tools.

---

← [Back to the documentation index](../README.md)
