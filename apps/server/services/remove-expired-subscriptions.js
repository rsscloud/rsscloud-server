// Drops expired/errored subscriptions and prunes empty feeds. The protocol
// logic lives in @rsscloud/core; this is a thin adapter over core.removeExpired()
// that the server schedules (app.js) and the /test/* API drives. Callers own
// their own error handling, and core reads/writes the shared store, so the
// effects land in the same store the /test/getData view reads.
//
// Differs from the retired hand-rolled sweep by design:
//   - returns core's MaintenanceResult (feedsProcessed/feedsDeleted) instead of
//     the legacy documentsProcessed/documentsDeleted/urlsFixed shape;
//   - drops the IPv4-mapped-IPv6 callback rewrite (new subs are normalized at
//     subscribe time, so only stale persisted URLs went uncleaned);
//   - treats ctConsecutiveErrors >= maxConsecutiveErrors as exhausted (was a
//     strict >), matching core's delivery filter.

// Built with an injected core so callers (production wiring, the /test/* API)
// supply the singleton while tests supply an in-memory core.
function createRemoveExpiredSubscriptions({ core }) {
    return function removeExpiredSubscriptions() {
        return core.removeExpired();
    };
}

module.exports = createRemoveExpiredSubscriptions;
