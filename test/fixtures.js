const storeApi = require('./store-api');

exports.mochaGlobalSetup = async function() {
    await storeApi.before();
};

exports.mochaGlobalTeardown = async function() {
    await storeApi.after();
};
