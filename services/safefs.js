"use strict";

var async = require('async');
var fs = require('fs-ext');
var filenames = {};
var watching = {};

function logErrorCallback(errorMessage) {
    if (errorMessage) {
        console.log(errorMessage);
    }
}

function loadStruct(name, callback) {
    var content, fileDescriptor, filename;
    callback = callback || function () { return; };
    if (undefined === filenames[name]) {
        return callback('Cannot find filename named ' + name);
    }
    filename = filenames[name];
    async.waterfall([
        function openFile(callback) {
            fs.open(filename, 'a+', '0666', callback);
        },
        function lockFile(fd, callback) {
            fileDescriptor = fd;
            fs.flock(fileDescriptor, 'sh', callback);
        },
        function readFile(callback) {
            fs.readFile(
                filename,
                {'encoding': 'utf8'},
                callback
            );
        },
        function releaseLock(data, callback) {
            try {
                content = JSON.parse(data || '{}');
            } catch (e) {
                logErrorCallback(e);
                content = {};
            }
            fs.flock(fileDescriptor, 'un', callback);
        },
        function closeFile(callback) {
            fs.close(fileDescriptor, callback);
        },
        function returnContent() {
            return callback(null, content);
        }
    ], function handleError(errorMessage) {
        return callback(errorMessage);
    });
}

function nameStruct(filename, name) {
    filenames[name] = filename;
}

function saveStruct(name, data, callback) {
    var fileDescriptor, filename;
    callback = callback || function () { return; };
    if (undefined === filenames[name]) {
        return callback('Cannot find filename named ' + name);
    }
    filename = filenames[name];
    async.waterfall([
        function openFile(callback) {
            fs.open(filename, 'a', '0666', callback);
        },
        function lockFile(fd, callback) {
            fileDescriptor = fd;
            fs.flock(fileDescriptor, 'ex', callback);
        },
        function writeFile(callback) {
            fs.writeFile(
                filename,
                JSON.stringify(data, undefined, 4),
                {'encoding': 'utf8'},
                callback
            );
        },
        function releaseLock(callback) {
            fs.flock(fileDescriptor, 'un', callback);
        },
        function closeFile() {
            fs.close(fileDescriptor, callback);
        }
    ], function handleError(errorMessage) {
        return callback(errorMessage);
    });
}

function watchStruct(name, callback) {
    callback = callback || function () { return; };
    if (undefined === watching[name]) {
        loadStruct(name, function (errorMessage, content) {
            if (errorMessage) {
                return callback(errorMessage);
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
