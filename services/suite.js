"use strict";

var async = require('async');
var builder = require('xmlbuilder');
var crypto = require('crypto');
var moment = require('moment');
var querystring = require('querystring');
var request = require('request');
var safefs = require('../services/safefs');
var sprintf = require('sprintf-js').sprintf;
var url = require('url');

var MSG_ERR_INVALID_PROTOCOL = "Can't accept the notification request because " +
    "the protocol, \"%s\", is unsupported.";

var MSG_ERR_FEED_READ = "The subscription was cancelled because there was an " +
    "error reading the resource at URL %s.";

var MSG_NOTIFY_SUCCESS = "Thanks for the registration. It worked. When the feed " +
    "updates we'll notify you. Don't forget to re-register after 24 hours, your " +
    "subscription will expire in 25. Keep on truckin!";

var MSG_ERR_FAILED_SUBSCRIPTION = "The subscription was cancelled because the call " +
    "failed when we tested the handler.";

var MSG_ERR_FAILED_PING = "The ping was cancelled because there was an " +
    "error reading the resource at URL %s.";

var MSG_PING_SUCCESS = "Thanks for the ping.";

var MSG_LOG_SUBSCRIBE = 'Subscriber <a href="%s">%s</a> requests notification ' +
    'when the <a href="%s">feed</a> changes via <i>%s</i> protocol.';

var MSG_LOG_NOTIFY = 'Subscriber <a href="%s">%s</a> was notified that ' +
    '<a href="%s">feed</a> has changed via <i>%s</i> protocol.';

var MSG_ERR_PING_RECENT = "Can't accept the request because the minimum " +
    "seconds between pings is %s and you pinged us %s seconds ago.";

var MSG_LOG_PING = '<a href="%s">Feed</a> was said to have changed. We checked and the claim appears to be %s.';

var MSG_ERR_NO_SUBSCRIPTIONS = 'No subscriptions found for <a href="%s">feed</a>.';

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
            if (undefined === self.data.eventlog) {
                self.data.eventlog = [];
                dataDirty = true;
            }
            if (undefined === self.data.feeds) {
                self.data.feeds = {};
                dataDirty = true;
            }
            if (undefined === self.data.prefs) {
                self.data.prefs = {};
                dataDirty = true;
            }
            if (undefined === self.data.prefs.maxConsecutiveErrors) {
                self.data.prefs.maxConsecutiveErrors = 3;
                dataDirty = true;
            }
            if (undefined === self.data.prefs.maxFeedSize) {
                self.data.prefs.maxFeedSize = 1024 * 250; // 250K
                dataDirty = true;
            }
            if (undefined === self.data.prefs.ctSecsFeedExpire) {
                self.data.prefs.ctSecsFeedExpire = 25 * 60 * 60; // 25 Hours
                dataDirty = true;
            }
            if (undefined === self.data.prefs.minSecsBetweenPings) {
                self.data.prefs.minSecsBetweenPings = 0;
                dataDirty = true;
            }
            if (undefined === self.data.prefs.maxEvents) {
                self.data.prefs.maxEvents = 250;
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

RssCloudSuite.prototype.initFeed = function (feedUrl) {
    var self = this, feed;
    if (undefined === self.data.feeds[feedUrl]) {
        self.data.feeds[feedUrl] = {};
    }
    feed = self.data.feeds[feedUrl];

    if (undefined === feed.flDirty) {
        feed.flDirty = true;
    }
    if (undefined === feed.lastSize) {
        feed.lastSize = 0;
    }
    if (undefined === feed.lastHash) {
        feed.lastHash = 0;
    }
    if (undefined === feed.ctChecks) {
        feed.ctChecks = 0;
    }
    if (undefined === feed.whenLastCheck) {
        feed.whenLastCheck = moment('0', 'x');
    }
    if (undefined === feed.ctUpdates) {
        feed.ctUpdates = 0;
    }
    if (undefined === feed.whenLastUpdate) {
        feed.whenLastUpdate = moment('0', 'x');
    }
    return feed;
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
        subscription.whenExpires = moment().add(self.data.prefs.ctSecsFeedExpire, 'seconds');
    }
};

RssCloudSuite.prototype.logEvent = function (eventtype, htmltext, startticks) {
    var self = this, secs, time;

    time = moment();
    secs = (parseInt(time.format('x'), 10) - parseInt(startticks, 10)) / 1000;

    self.data.eventlog.unshift({
        'eventtype': eventtype,
        'htmltext': htmltext,
        'secs': secs,
        'time': time
    });

    while (self.data.prefs.maxEvents < self.data.eventlog.length) {
        self.data.eventlog.pop();
    }

    self.data.dirty = true;
};

RssCloudSuite.prototype.notifyOne = function (feedUrl, server, subscription, flLog, callback) {
    var self = this, startticks = moment().format('x');

    if (undefined === flLog) {
        flLog = true;
    }

    if (undefined === callback) {
        callback = function () {
            return;
        };
    }

    self.initSubscription(subscription);

    request.post({
        'url': server,
        'form': {'url': feedUrl}
    }, function (errorMessage, httpResponse) {
        var parts = url.parse(server);
        if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299) {
            subscription.ctErrors += 1;
            subscription.ctConsecutiveErrors += 1;
            subscription.whenLastError = moment();
            self.data.dirty = true;
            return callback(MSG_ERR_FAILED_SUBSCRIPTION);
        }
        subscription.whenLastUpdate = moment();
        subscription.ctUpdates += 1;
        subscription.ctConsecutiveErrors = 0;
        if (flLog) {
            self.logEvent(
                'Notify',
                sprintf(MSG_LOG_NOTIFY, server, parts.host, feedUrl, parts.protocol),
                startticks
            );
        }
        return callback(null);
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
            return callback(MSG_ERR_FAILED_SUBSCRIPTION);
        }
        subscription.whenLastUpdate = moment();
        subscription.ctUpdates += 1;
        subscription.ctConsecutiveErrors = 0;
        self.data.dirty = true;
        return callback(null);
    });
};

RssCloudSuite.prototype.pleaseNotify = function (apiurl, urlList, diffDomain, callback) {
    var self = this, startticks = moment().format('x');

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
                        if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299) {
                            return callback(sprintf(MSG_ERR_FEED_READ, feedUrl));
                        }
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
            if (undefined === self.data.subscriptions[feedUrl]) {
                self.data.subscriptions[feedUrl] = {};
            }
            if (undefined === self.data.subscriptions[feedUrl][apiurl]) {
                self.data.subscriptions[feedUrl][apiurl] = {};
            }
            subscription = self.data.subscriptions[feedUrl][apiurl];
            if (diffDomain) {
                self.notifyOneChallenge(feedUrl, apiurl, subscription, callback);
            } else {
                self.notifyOne(feedUrl, apiurl, subscription, false, callback);
            }
        },
        function (callback) {
            var parts;
            parts = url.parse(apiurl);
            async.each(
                urlList,
                function (feedUrl, callback) {
                    var subscriptions, subscription;
                    if (undefined === self.data.subscriptions[feedUrl]) {
                        self.data.subscriptions[feedUrl] = {};
                    }
                    subscriptions = self.data.subscriptions[feedUrl];
                    if (undefined === subscriptions[apiurl]) {
                        subscriptions[apiurl] = {};
                        self.initSubscription(subscriptions[apiurl]);
                    }
                    subscription = subscriptions[apiurl];
                    subscription.whenExpires = moment().add(self.data.prefs.ctSecsFeedExpire, 'seconds');
                    self.logEvent(
                        'Subscribe',
                        sprintf(MSG_LOG_SUBSCRIBE, apiurl, parts.host, feedUrl, parts.protocol),
                        startticks
                    );
                    return callback(null);
                },
                callback
            );
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

RssCloudSuite.prototype.notifySubscribers = function (feedUrl, callback) {
    var self = this, subscriptions, apiurl;

    if (undefined === self.data.subscriptions[feedUrl]) {
        return callback(sprintf(MSG_ERR_NO_SUBSCRIPTIONS, feedUrl));
    }

    subscriptions = self.data.subscriptions[feedUrl];

    for (apiurl in subscriptions) {
        if (subscriptions.hasOwnProperty(apiurl)) {
            self.notifyOne(feedUrl, apiurl, subscriptions[apiurl], true);
        }
    }

    callback(null);
};

RssCloudSuite.prototype.ping = function (feedUrl, callback) {
    var self = this,
        feed,
        minsecs,
        startticks = moment().format('x'),
        ctsecs;

    async.waterfall([
        function initializeData(callback) {
            self.init(callback);
        },
        function initializeFeed(callback) {
            minsecs = self.data.prefs.minSecsBetweenPings;
            if (0 < minsecs) {
                ctsecs = moment().diff(feed.whenLastCheck, 'seconds');
                if (ctsecs < minsecs) {
                    return callback(sprintf(MSG_ERR_PING_RECENT, minsecs, ctsecs));
                }
            }
            feed = self.initFeed(feedUrl);
            feed.ctChecks += 1;
            feed.whenLastCheck = moment();
            callback(null);
        },
        function updateFeed(callback) {
            request.get({
                'url': feedUrl
            }, function (errorMessage, httpResponse, body) {
                var md5, hash;
                if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299) {
                    callback(sprintf(MSG_ERR_FAILED_PING, feedUrl));
                }
                md5 = crypto.createHash('md5');
                md5.update(body);
                hash = md5.digest('hex');
                if (feed.lastHash !== hash) {
                    feed.flDirty = true;
                } else if (feed.lastSize !== body.length) {
                    feed.flDirty = true;
                } else {
                    feed.flDirty = false;
                }
                feed.lastHash = hash;
                feed.lastSize = body.length;
                self.data.dirty = true;
                callback(null);
            });
        },
        function notifySubscribers(callback) {
            self.logEvent(
                'Ping',
                sprintf(MSG_LOG_PING, feedUrl, feed.flDirty.toString()),
                startticks
            );
            if (feed.flDirty) {
                feed.ctUpdates += 1;
                feed.whenLastUpdate = moment();
                return self.notifySubscribers(feedUrl, callback);
            }
            callback(null);
        },
        function finished() {
            return callback(null, {
                'success': true,
                'msg': MSG_PING_SUCCESS
            });
        }
    ], function handleError(errorMessage) {
        return callback(errorMessage);
    });
};

RssCloudSuite.prototype.glueUrlParts = function (scheme, client, port, path, protocol, callback) {
    var apiurl;

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

    return callback(null, apiurl);
};

RssCloudSuite.prototype.errorResult = function (errorMessage) {
    return {
        'success': false,
        'msg': errorMessage
    };
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
