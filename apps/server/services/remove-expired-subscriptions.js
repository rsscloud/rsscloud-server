// Drops expired/errored subscriptions and prunes empty feeds. The protocol
// logic lives in @rsscloud/core; this is a thin adapter over core.removeExpired()
// that the server schedules (app.js) and the /test/* API drives. Callers own
// their own error handling, and core reads/writes the shared store, so the
// effects land in the same json-store the legacy /test/getData reads.
//
// Differs from the retired hand-rolled sweep by design (see PLAN slice E):
//   - returns core's MaintenanceResult (feedsProcessed/feedsDeleted) instead of
//     the legacy documentsProcessed/documentsDeleted/urlsFixed shape;
//   - drops the IPv4-mapped-IPv6 callback rewrite (new subs are normalized at
//     subscribe time, so only stale persisted URLs went uncleaned);
//   - treats ctConsecutiveErrors >= maxConsecutiveErrors as exhausted (was a
//     strict >), matching core's delivery filter.

const { core } = require('../core');

function removeExpiredSubscriptions() {
    return core.removeExpired();
}

module.exports = removeExpiredSubscriptions;
