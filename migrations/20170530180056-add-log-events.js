(function () {
    "use strict";

    var dbm, type, seed;

    /**
      * We receive the dbmigrate dependency from dbmigrate initially.
      * This enables us to not have to rely on NODE_PATH.
      */
    module.exports.setup = (options, seedLink) => {
        dbm = options.dbmigrate;
        type = dbm.dataType;
        seed = seedLink;
    };

    module.exports.up = (db, callback) => {
        db.createTable('log_events', {
            id: { type: 'int', primaryKey: true },
            eventtype: 'text',
            htmltext: 'text',
            secs: 'int',
            time: 'text',
            headers: 'text'
        }, callback);
    };

    module.exports.down = (db, callback) => {
        db.dropTable('log_events', callback);
    };

}());
