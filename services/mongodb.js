(function () {
    "use strict";

    const mongodb = require('mongodb'),
        state = {};

    module.exports = {
        connect: async function (name, uri) {
            if (state[name]) {
                return;
            }

            const client = await mongodb(uri, { useUnifiedTopology: true });

            state[name] = client;

            console.log(`${name} Database Connected`);

            return state[name].db();
        },
        get: function (name) {
            return state[name].db();
        },
        close: async function (name) {
            if (state[name]) {
                return state[name].close()
                    .then(() => {
                        delete state[name];
                    });
            }
        }
    };
}());
