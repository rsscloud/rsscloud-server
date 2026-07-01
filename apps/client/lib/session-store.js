const { randomUUID } = require('crypto');

const MAX_LOG_ENTRIES = 100;

// Per-session in-memory state for the client harness: request log, served
// feed items, and WebSub secrets, isolated per session id so concurrent
// public users don't see each other's traffic.
function createSessionStore({ now = () => Date.now(), idGenerator = randomUUID } = {}) {
    const sessions = new Map();

    function newSession() {
        const createdAt = now();
        return {
            requestLog: [],
            feedItems: {},
            webSubSecrets: {},
            sockets: new Set(),
            createdAt,
            lastOutgoingAt: createdAt
        };
    }

    function createSession() {
        const id = idGenerator();
        const session = newSession();
        sessions.set(id, session);
        return { id, session };
    }

    function get(id) {
        return sessions.get(id);
    }

    function getOrCreate(id) {
        if (!sessions.has(id)) {
            sessions.set(id, newSession());
        }
        return sessions.get(id);
    }

    function touchOutgoing(id) {
        const session = sessions.get(id);
        if (session) {
            session.lastOutgoingAt = now();
        }
    }

    function isIdle(id, idleMs) {
        const session = sessions.get(id);
        if (!session) {
            return true;
        }
        // A live socklog viewer is itself a sign of active use — e.g.
        // someone left a tab open overnight watching an external feed. Don't
        // let the callback surface go dark just because no button's been
        // clicked recently.
        if (session.sockets.size > 0) {
            return false;
        }
        return now() - session.lastOutgoingAt > idleMs;
    }

    function sweep(maxIdleMs) {
        let evicted = 0;
        for (const [id, session] of sessions) {
            if (session.sockets.size > 0) {
                continue;
            }
            if (now() - session.lastOutgoingAt > maxIdleMs) {
                sessions.delete(id);
                evicted += 1;
            }
        }
        return evicted;
    }

    function size() {
        return sessions.size;
    }

    // Owns the request log's lifecycle (append + cap) so callers (the
    // WebSocket layer, the incoming-request middleware) don't each
    // reimplement the truncation policy.
    function appendLog(id, entry) {
        const session = sessions.get(id);
        if (!session) {
            return;
        }
        session.requestLog.unshift(entry);
        if (session.requestLog.length > MAX_LOG_ENTRIES) {
            session.requestLog.pop();
        }
    }

    return {
        createSession,
        get,
        getOrCreate,
        touchOutgoing,
        isIdle,
        sweep,
        size,
        appendLog
    };
}

module.exports = { createSessionStore };
