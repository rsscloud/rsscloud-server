(function () {
    "use strict";

    const fs = require('fs'),
        mongodb = require('mongodb'),
        state = {
            db: null
        };

    module.exports = {
        connect: async function (uri) {
            if (state.db) {
                return;
            }

            const client = await mongodb(uri, { useUnifiedTopology: true }),
                promises = [];

            state.db = client.db();

            // For backwards compatibility
            // TODO: Pull into own script
            if (fs.existsSync('./data/data.json')) {
                const data = JSON.parse(fs.readFileSync('./data/data.json', 'utf8'));

                promises.push(state.db.collection('resources').bulkWrite(
                    Object.keys(data.resources).map(id => {
                        return {
                            replaceOne: {
                                filter: { _id: id },
                                replacement: data.resources[id],
                                upsert: true
                            }
                        };
                    })
                ));

                promises.push(state.db.collection('subscriptions').bulkWrite(
                    Object.keys(data.subscriptions).map(id => {
                        return {
                            replaceOne: {
                                filter: { _id: id },
                                replacement: data.subscriptions[id],
                                upsert: true
                            }
                        };
                    })
                ));
            }

            return Promise.all(promises)
                .then(() => {
                    return client.db();
                });
        },
        get: function () {
            return state.db;
        },
        close: async function () {
            if (state.db) {
                return state.db.close()
                    .then(() => {
                        state.db = null;
                    });
            }
        }
    };
}());
