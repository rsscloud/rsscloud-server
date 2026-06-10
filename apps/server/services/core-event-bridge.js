// Bridges core's observability events onto the /wsLog websocket so /viewLog keeps
// working once endpoints run through @rsscloud/core. Per PLAN #4 we render core's
// events as-is: no enrichment, request headers dropped, and per-event timing taken
// from core's `durationMs` where it carries one (only `ping` does today).

const CORE_EVENTS = [
    'ping',
    'subscribe',
    'resourceChanged',
    'notify',
    'notifyFailed',
    'error'
];

// The `error` payload carries an Error instance, which would JSON-serialize to
// `{}`; surface its scope and message instead. Other payloads broadcast as-is.
function toData(eventtype, payload) {
    if (eventtype === 'error') {
        return { scope: payload.scope, error: payload.error?.message };
    }
    return payload;
}

function bridgeCoreEvents(events, websocket, now = () => new Date()) {
    for (const eventtype of CORE_EVENTS) {
        events.on(eventtype, payload => {
            websocket.broadcast({
                eventtype,
                data: toData(eventtype, payload),
                secs:
                    typeof payload.durationMs === 'number'
                        ? payload.durationMs / 1000
                        : 0,
                time: now()
            });
        });
    }
}

module.exports = bridgeCoreEvents;
