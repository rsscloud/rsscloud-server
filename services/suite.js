"use strict";

var async = require('async');
var builder = require('xmlbuilder');
var request = require('request');
var safefs = require('../services/safefs');
var sprintf = require('sprintf-js').sprintf;

var MSG_ERR_INVALID_PROTOCOL = "Can't accept the notification request because " +
    "the protocol, \"%s\", is unsupported.";

var MSG_ERR_FEED_READ = "The subscription was cancelled because there was an " +
    "error reading the resource at URL %s.";

var MSG_NOTIFY_SUCCESS = "Thanks for the registration. It worked. When the feed " +
    "updates we'll notify you. Don't forget to re-register after 24 hours, your " +
    "subscription will expire in 25. Keep on truckin!";

function checkFeedUrlStatusCode(feedUrl, callback) {
    request({
        'url': feedUrl,
        'method': 'HEAD'
    }, function checkStatusCode(error, response) {
        if (error || response.statusCode < 200 || response.statusCode > 299) {
            callback(sprintf(MSG_ERR_FEED_READ, feedUrl));
        } else {
            callback(null, response.statusCode);
        }
    });
}

function RssCloudSuite() {
    var self = this;

    self.data = {};

    return self;
}

RssCloudSuite.prototype.init = function (callback) {
    var self = this, dataDirty = false;

    async.waterfall([
        function loadData(callback) {
            safefs.watchStruct('data', callback);
        },
        function assignData(data, callback) {
            self.data = data;
            callback(null);
        },
        function checkDefaults() {
            if (undefined === self.data.feeds) {
                self.data.feeds = {};
                dataDirty = true;
            }
            if (undefined === self.data.subscribers) {
                self.data.subscribers = {};
                dataDirty = true;
            }
            if (undefined === self.data.subscriptions) {
                self.data.subscriptions = {};
                dataDirty = true;
            }
            if (true === dataDirty) {
                self.data.dirty = true;
            }
            callback(null);
        }
    ], function handleError(errorMessage) {
        callback(errorMessage);
    });
};

RssCloudSuite.prototype.errorResult = function (errorMessage) {
    return {
        'success': false,
        'msg': errorMessage
    };
};

RssCloudSuite.prototype.notifyOneChallenge = function (apiurl, callback) {
    callback(null, true);
};

RssCloudSuite.prototype.notifyOne = function (apiurl, something, callback) {
    callback(null, true);
};

RssCloudSuite.prototype.pleaseNotify = function (scheme, client, port, path, protocol, urlList, diffDomain, callback) {
    var self = this, apiurl;

    switch (protocol) {
    case 'http-post':
        apiurl = scheme + '://';
        break;
    default:
        callback(sprintf(MSG_ERR_INVALID_PROTOCOL, protocol));
        return;
    }

    apiurl += client + ':' + port;

    if (0 !== path.indexOf('/')) {
        path = '/' + path;
    }

    apiurl += path;

    /*jslint unparam: true*/
    async.waterfall([
        function initializeData(callback) {
            self.init(callback);
        },
        function checkFeedUrlStatusCodes(callback) {
            async.map(urlList, checkFeedUrlStatusCode, callback);
        },
        function (statusCodes, callback) {
            if (diffDomain) {
                self.notifyOneChallenge(apiurl, callback);
            } else {
                self.notifyOne(apiurl, false, callback);
            }
        },
        function () {
            callback(null, {
                'success': true,
                'msg': MSG_NOTIFY_SUCCESS
            });
        }
    ], function handleError(errorMessage) {
        callback(errorMessage);
    });
    /*jslint unparam: false*/
};

RssCloudSuite.prototype.restReturnSuccess = function (success, message, element) {
    if (undefined ===  element) {
        element = 'result';
    }

    return builder.create(element)
        .att('success', success ? 'true' : 'false')
        .att('msg', message)
        .end({'pretty': true});
};

module.exports = new RssCloudSuite();
