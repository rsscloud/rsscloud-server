# Changelog

## [2.4.0](https://github.com/rsscloud/rsscloud-server/compare/v2.3.1...v2.4.0) (2026-03-20)


### Features

* add dual-write JSON file store alongside MongoDB ([096f46a](https://github.com/rsscloud/rsscloud-server/commit/096f46ac9408b8af8cce5bbac7dc3111ba54536a))
* add dual-write JSON file store alongside MongoDB ([b00f6dd](https://github.com/rsscloud/rsscloud-server/commit/b00f6ddff09d88aee8b55f289fed2c4771a87fed))
* add stats page with cached operational statistics ([5e8731f](https://github.com/rsscloud/rsscloud-server/commit/5e8731f8d379cd403eacfc69e53e06f0579a4172))


### Bug Fixes

* allow pleaseNotify when ping frequency check triggers ([a31cf02](https://github.com/rsscloud/rsscloud-server/commit/a31cf02ca7c7266dd06c1b95c08e6cc3075cb44a))
* clean up orphaned resources and subscriptions ([21464c4](https://github.com/rsscloud/rsscloud-server/commit/21464c413fa31543b093e454427bb8f21d6cc8f8))
* clean up orphaned resources and subscriptions ([d84d3d7](https://github.com/rsscloud/rsscloud-server/commit/d84d3d7adb252360f292e3648515d648bba61dd2))
* clean up stale and orphaned entries from subscriptions.json ([ff3fa87](https://github.com/rsscloud/rsscloud-server/commit/ff3fa87d1df075ac3a1b3e6107006d4ab77e3029))
* clean up subscription docs with empty pleaseNotify arrays ([c272b96](https://github.com/rsscloud/rsscloud-server/commit/c272b9605f644c51bc27a3d10fcf8c5544abb224))
* normalize IPv4-mapped IPv6 addresses in subscription URLs ([c37902f](https://github.com/rsscloud/rsscloud-server/commit/c37902fdfbb70d507f26347c39513582601c835e))
* remove ping of feeds with missing resource during cleanup ([725daeb](https://github.com/rsscloud/rsscloud-server/commit/725daebf816dbd2eb93d1f9f5ac43437084a2b81))
* use https scheme for http-post subscriptions on port 443 ([c796df3](https://github.com/rsscloud/rsscloud-server/commit/c796df32fb9916cd47dde21390f06ddb6eee1746))
* use whenLastUpdate instead of whenLastCheck for stats ([e1ac16c](https://github.com/rsscloud/rsscloud-server/commit/e1ac16c9d9baad78bae2dbbf727738f16913fe46))

## [2.3.1](https://github.com/rsscloud/rsscloud-server/compare/v2.3.0...v2.3.1) (2026-03-18)


### Bug Fixes

* use protocol-aware WebSocket URL for viewLog page ([9eba9a6](https://github.com/rsscloud/rsscloud-server/commit/9eba9a64bfe8ce5aa13632389128a775fdb6962c))

## [2.3.0](https://github.com/rsscloud/rsscloud-server/compare/2.2.1...v2.3.0) (2026-03-18)


### Features

* add realtime log page and improved test infrastructure ([0e5ac48](https://github.com/rsscloud/rsscloud-server/commit/0e5ac485b9004fc20eab6ae1f56430c43b1b50a6))
