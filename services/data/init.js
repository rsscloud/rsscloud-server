(function () {
    "use strict";

    var async = require('async'),
        DBMigrate = require('db-migrate'),
        sqlite3 = require('sqlite3');

    function connectToDatabase(filename, callback) {
        var db = new sqlite3.Database(
            filename,
            sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
            function completeConnect(err) {
                if (err) {
                    return callback(err);
                }
                return callback(null, db);
            }
        );
    }

    function init(callback) {
        var dbmigrate;
        async.waterfall([
            function asyncDoMigration(callback) {
                dbmigrate = DBMigrate.getInstance(true);
                dbmigrate.up(callback);
            },
            function asyncConnectToDatabase(callback) {
                if ('sqlite3' === dbmigrate.config.getCurrent().settings.driver) {
                    connectToDatabase(dbmigrate.config.getCurrent().settings.filename, callback);
                } else {
                    callback('This application currently requires sqlite3 as the driver');
                }
            }
        ], callback);
    }

    module.exports = init;
}());
