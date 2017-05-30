'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db, callback) {
    db.createTable('log_events', {
        id: { type: 'int', primaryKey: true },
        eventtype: 'text',
        htmltext: 'text',
        secs: 'int',
        time: 'text',
        headers: 'text'
    }, callback);
};

exports.down = function(db, callback) {
    db.dropTable('log_events', callback);
};

exports._meta = {
  "version": 1
};
