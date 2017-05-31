(function () {
    "use strict";

    var db,
        init = require('./init.js');

    function getDb(callback) {
        if (undefined === db) {
            init(function cbInitDb(err, myDb) {
                if (err) {
                    return callback(err);
                }
                db = myDb;
                return callback(null, db);
            });
        } else {
            return callback(null, db);
        }
    }

    module.exports = {
        'init': init,
        'getDb': getDb
    };
}());
