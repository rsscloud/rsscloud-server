const mongodb = require("./mongodb");

exports.mochaGlobalSetup = async function () {
    await mongodb.before();
};

exports.mochaGlobalTeardown = async function () {
    await mongodb.after();
};
