"use strict";

var async = require('async');
var fs = require('fs-ext');
var filenames = {};
var watching = {};

function loadStruct(name, callback) {
    var content, fileDescriptor, filename;
    if (undefined === filenames[name]) {
        callback('Cannot find filename named ' + name);
        return;
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
                console.log(e);
                content = {};
            }
            fs.flock(fileDescriptor, 'un', callback);
        },
        function closeFile(callback) {
            fs.close(fileDescriptor, callback);
        },
        function returnContent() {
            callback(null, content);
        }
    ], function handleError(errorMessage) {
        callback(errorMessage);
    });
}

function nameStruct(filename, name) {
    filenames[name] = filename;
}

function saveStruct(name, data, callback) {
    var fileDescriptor, filename;
    if (undefined === filenames[name]) {
        callback('Cannot find filename named ' + name);
        return;
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
        callback(errorMessage);
    });
}

function watchStruct(name, callback) {
    var filename;
    if (undefined === filenames[name]) {
        callback('Cannot find filename named ' + name);
        return;
    }
    filename = filenames[name];
    if (undefined === watching[filename]) {
        loadStruct(filename, function (errorMessage, content) {
            if (errorMessage) {
                callback(errorMessage);
            }
            watching[filename] = content;
            watching[filename].dirty = false;
            callback(null, watching[filename]);
        });
    } else {
        callback(null, watching[filename]);
    }
}

function logErrorCallback(errorMessage) {
    if (errorMessage) {
        console.log(errorMessage);
    }
}

setInterval(function () {
    var filename;
    for (filename in watching) {
        if (watching.hasOwnProperty(filename) && watching[filename].dirty) {
            watching[filename].dirty = false;
            saveStruct(filename, watching[filename], logErrorCallback);
        }
    }
}, 1000);

module.exports = {
    'loadStruct': loadStruct,
    'nameStruct': nameStruct,
    'saveStruct': saveStruct,
    'watchStruct': watchStruct
};
