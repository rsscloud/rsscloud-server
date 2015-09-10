(function () {
    "use strict";

    var async = require('async'),
        fs = require('fs'),
        filenames = {},
        watching = {};

    function logErrorCallback(err) {
        if (err) {
            console.error(err);
        }
    }

    function loadStruct(name, callback) {
        var content, filename;

        callback = callback || function () {
            return;
        };

        if (undefined === filenames[name]) {
            return callback('Cannot find filename named ' + name);
        }
        filename = filenames[name];
        async.waterfall([
            function readFile(callback) {
                fs.readFile(
                    filename,
                    {'encoding': 'utf8'},
                    callback
                );
            },
            function parseData(data, callback) {
                try {
                    content = JSON.parse(data || '{}');
                } catch (e) {
                    logErrorCallback(e);
                    content = {};
                }
                callback(null);
            },
            function returnContent() {
                return callback(null, content);
            }
        ], function handleError(err) {
            if (err instanceof Error && err.code === 'ENOENT') {
                return callback(null, {});
            }
            return callback(err);
        });
    }

    function nameStruct(filename, name) {
        filenames[name] = filename;
    }

    function saveStruct(name, data, callback) {
        var filename;

        callback = callback || function () {
            return;
        };

        if (undefined === filenames[name]) {
            return callback('Cannot find filename named ' + name);
        }
        filename = filenames[name];
        async.waterfall([
            function writeFile(callback) {
                fs.writeFile(
                    filename,
                    JSON.stringify(data, undefined, 4),
                    {'encoding': 'utf8'},
                    callback
                );
            }
        ], function handleError(err) {
            return callback(err);
        });
    }

    function watchStruct(name, callback) {
        callback = callback || function () {
            return;
        };

        if (undefined === watching[name]) {
            loadStruct(name, function (err, content) {
                if (err) {
                    return callback(err);
                }
                watching[name] = content;
                watching[name].dirty = false;
                return callback(null, watching[name]);
            });
        } else {
            return callback(null, watching[name]);
        }
    }

    setInterval(function () {
        var name;
        for (name in watching) {
            if (watching.hasOwnProperty(name) && watching[name].dirty) {
                watching[name].dirty = false;
                saveStruct(name, watching[name], logErrorCallback);
            }
        }
    }, 1000);

    module.exports = {
        'loadStruct': loadStruct,
        'nameStruct': nameStruct,
        'saveStruct': saveStruct,
        'watchStruct': watchStruct
    };
}());
