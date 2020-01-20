(function () {
    "use strict";

    const mongodb = require('mongodb'),
        state = {
            client: null
        };

    module.exports = {
        connect: async function (uri) {
            if (state.client) {
                return;
            }

            const client = await mongodb(uri, { useUnifiedTopology: true });

            state.client = client;

            return state.client.db();
        },
        get: function () {
            return state.client.db();
        },
        close: async function () {
            if (state.client) {
                return state.client.close()
                    .then(() => {
                        state.client = null;
                    });
            }
        }
    };
}());
