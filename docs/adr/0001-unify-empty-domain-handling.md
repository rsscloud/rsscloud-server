# Unify empty-domain handling across the REST and XML-RPC front doors

When `buildSubscribeRequest` absorbed the callback-URL assembly that the two
dispatchers had each copied, it adopted a single rule: an **absent or empty-string**
`domain` means "no explicit domain" — use the caller's address and set `diffDomain:
false`. This deliberately changes the XML-RPC `pleaseNotify` path, which previously
treated only `undefined` as absent and so took an empty-string `domain` (`params[5] ===
''`) down the *explicit-domain* branch, building a malformed callback like
`http://:5337/RPC2` with `diffDomain: true`.

## Status

accepted

## Why this is a deliberate parity deviation

The project's wire-parity convention holds the dispatchers byte-compatible with Dave
Winer's original rssCloud server. This change breaks that for one input
(empty-string XML-RPC domain), so it is recorded here to stop a future parity pass from
"restoring" the old behaviour. The divergence between the two front doors was an
unguarded latent inconsistency — no test pinned it, and the REST front door already
collapsed `'' | null | undefined` to absent — not an intended feature. A single rule is
the correct behaviour and removes the malformed-URL path. A regression test pins the new
XML-RPC behaviour.
