const { MongoClient } = require('mongodb'),
    state = {};

async function connect(name, uri) {
    if (state[name]) {
        return;
    }

    const client = await MongoClient.connect(uri);

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
    await Promise.all(Object.keys(state).map(close));
}

module.exports = {
    connect,
    get,
    close,
    closeAll
};
