"use strict";

var async = require('async');
var builder = require('xmlbuilder');
var crypto = require('crypto');
var moment = require('moment');
var querystring = require('querystring');
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

var MSG_ERR_FAILED = "The subscription was cancelled because the call failed when we tested the handler.";

function randomValueBase64(len) {
    return crypto.randomBytes(Math.ceil(len * 3 / 4))
        .toString('base64')   // convert to base64 format
        .slice(0, len)        // return required number of characters
        .replace(/\+/g, '0')  // replace '+' with '0'
        .replace(/\//g, '0'); // replace '/' with '0'
}

function RssCloudSuite() {
    var self = this;

    self.data = {};
    self.prefs = {
        ctSecsFeedExpire: 90000
    };

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
            return callback(null);
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
            return callback(null);
        }
    ], function handleError(errorMessage) {
        return callback(errorMessage);
    });
};

RssCloudSuite.prototype.initSubscription = function (subscription) {
    var self = this;

    if (undefined === subscription.ctUpdates) {
        subscription.ctUpdates = 0;
    }
    if (undefined === subscription.whenLastUpdate) {
        subscription.whenLastUpdate = moment('0', 'x');
    }
    if (undefined === subscription.ctErrors) {
        subscription.ctErrors = 0;
    }
    if (undefined === subscription.ctConsecutiveErrors) {
        subscription.ctConsecutiveErrors = 0;
    }
    if (undefined === subscription.whenLastError) {
        subscription.whenLastError = moment('0', 'x');
    }
    if (undefined === subscription.whenExpires) {
        subscription.whenExpires = moment().add(self.prefs.ctSecsFeedExpire, 'seconds');
    }
};

RssCloudSuite.prototype.errorResult = function (errorMessage) {
    return {
        'success': false,
        'msg': errorMessage
    };
};

RssCloudSuite.prototype.notifyOne = function (feedUrl, server, subscription, callback) {
    var self = this;

    self.initSubscription(subscription);

    request.post({
        'url': server,
        'form': {'url': feedUrl}
    }, function (errorMessage, httpResponse) {
        if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299) {
            subscription.ctErrors += 1;
            subscription.ctConsecutiveErrors += 1;
            subscription.whenLastError = moment();
            self.data.dirty = true;
            return callback(MSG_ERR_FAILED);
        }
        subscription.whenLastUpdate = moment();
        subscription.ctUpdates += 1;
        subscription.ctConsecutiveErrors = 0;
        self.data.dirty = true;
        return callback(null, true);
    });
};

RssCloudSuite.prototype.notifyOneChallenge = function (feedUrl, server, subscription, callback) {
    var self = this, challenge, testUrl;

    self.initSubscription(subscription);

    challenge = randomValueBase64(20);
    testUrl = server + '?' + querystring.stringify({
        'url': feedUrl,
        'challenge': challenge
    });

    request.get({
        'url': testUrl
    }, function (errorMessage, httpResponse, body) {
        if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299 || body !== challenge) {
            subscription.ctErrors += 1;
            subscription.ctConsecutiveErrors += 1;
            subscription.whenLastError = moment();
            self.data.dirty = true;
            return callback(MSG_ERR_FAILED);
        }
        subscription.whenLastUpdate = moment();
        subscription.ctUpdates += 1;
        subscription.ctConsecutiveErrors = 0;
        self.data.dirty = true;
        return callback(null, true);
    });
};

RssCloudSuite.prototype.pleaseNotify = function (scheme, client, port, path, protocol, urlList, diffDomain, callback) {
    var self = this, apiurl;

    switch (protocol) {
    case 'http-post':
        apiurl = scheme + '://';
        break;
    default:
        return callback(sprintf(MSG_ERR_INVALID_PROTOCOL, protocol));
    }

    apiurl += client + ':' + port;

    if (0 !== path.indexOf('/')) {
        path = '/' + path;
    }

    apiurl += path;

    async.waterfall([
        function initializeData(callback) {
            self.init(callback);
        },
        function checkFeedUrlStatusCodes(callback) {
            async.each(
                urlList,
                function (feedUrl, callback) {
                    request({
                        'url': feedUrl,
                        'method': 'HEAD'
                    }, function checkStatusCode(errorMessage, httpResponse) {
                        var subscriptions, subscription;
                        if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299) {
                            return callback(sprintf(MSG_ERR_FEED_READ, feedUrl));
                        }
                        if (undefined === self.data.subscriptions[feedUrl]) {
                            self.data.subscriptions[feedUrl] = {};
                        }
                        subscriptions = self.data.subscriptions[feedUrl];
                        if (undefined === subscriptions[apiurl]) {
                            subscriptions[apiurl] = {};
                            self.initSubscription(subscriptions[apiurl]);
                        }
                        subscription = subscriptions[apiurl];
                        subscription.whenExpires = moment().add(self.prefs.ctSecsFeedExpire, 'seconds');
                        self.data.dirty = true;
                        return callback(null);
                    });
                },
                callback
            );
        },
        function (callback) {
            var subscription, feedUrl;
            if (undefined === urlList[0]) {
                return callback('No feeds specified');
            }
            feedUrl = urlList[0];
            subscription = self.data.subscriptions[feedUrl][apiurl];
            if (diffDomain) {
                self.notifyOneChallenge(feedUrl, apiurl, subscription, callback);
            } else {
                self.notifyOne(feedUrl, apiurl, subscription, callback);
            }
        },
        function () {
            return callback(null, {
                'success': true,
                'msg': MSG_NOTIFY_SUCCESS
            });
        }
    ], function handleError(errorMessage) {
        return callback(errorMessage);
    });
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
