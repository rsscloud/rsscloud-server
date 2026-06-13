# @rsscloud/client

The **subscriber + publisher end** of the [rssCloud](https://github.com/rsscloud/rsscloud-server)
notification protocol — the mirror of `@rsscloud/core` (the hub end).

- **Subscriber:** send `pleaseNotify` (REST + XML-RPC), echo the http-post
  challenge, and parse incoming notifications.
- **Publisher:** send `ping` (REST + XML-RPC), and emit a feed carrying the
  `<cloud>` element.

It builds its XML-RPC on the shared [`@rsscloud/xml-rpc`](../xml-rpc) codec and
talks to a hub over an injectable `fetch`, so it has no server dependency.

## License

MIT — see [LICENSE.md](./LICENSE.md).
