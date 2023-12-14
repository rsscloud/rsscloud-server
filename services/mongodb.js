(function () {
    "use strict";

    const { MongoClient } = require('mongodb'),
        state = {};

    async function connect(name, uri) {
        if (state[name]) {
            return;
        }

        const client = await MongoClient.connect(uri, { useUnifiedTopology: true });

        state[name] = client;

        // console.log(`${name} Database Connected`);

        return state[name].db();
    }

    function get(name) {
        return state[name].db();
    }

    async function close(name) {
        if (state[name]) {
            return state[name].close()
                .finally(() => {
                    delete state[name];
                });
        }
    }

    async function closeAll() {
        await Promise.all(Object.keys(state).map(name => close));
    }

    function cleanup() {
        closeAll()
            .finally(() => {
                process.exit();
            });
    }

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    module.exports = {
        connect,
        get,
        close,
        closeAll
    };
}());
