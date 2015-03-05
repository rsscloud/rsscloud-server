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

var MSG_ERR_SUB_INVALID_PROTOCOL = "Can't accept the subscription because " +
    "the protocol, \"%s\", is unsupported.";

var MSG_ERR_SUB_READ_RESOURCE = "The subscription was cancelled because there was an " +
    "error reading the resource at URL %s.";

var MSG_ERR_SUB_NO_RESOURCES = 'No resources specified';

var MSG_ERR_SUB_FAILED_HANDLER = "The subscription was cancelled because the call " +
    "failed when we tested the handler.";

var MSG_SUCCESS_SUB = "Thanks for the registration. It worked. When the resource " +
    "updates we'll notify you. Don't forget to re-register after 24 hours, your " +
    "subscription will expire in 25. Keep on truckin!";

var MSG_LOG_SUB = 'Subscriber <a href="%s">%s</a> requests notification ' +
    'when the <a href="%s">resource</a> changes via <i>%s</i> protocol.';

var MSG_ERR_PING_RECENT = "Can't accept the request because the minimum " +
    "seconds between pings is %s and you pinged us %s seconds ago.";

var MSG_ERR_PING_READ_RESOURCE = "The ping was cancelled because there was an " +
    "error reading the resource at URL %s.";

var MSG_ERR_PING_NO_SUBSCRIPTIONS = 'No subscriptions found for <a href="%s">resource</a>.';

var MSG_SUCCESS_PING = "Thanks for the ping.";

var MSG_LOG_PING = 'The <a href="%s">resource</a> was said to have changed. We checked and the claim appears to be %s.';

var MSG_LOG_NOTIFY = 'Subscriber <a href="%s">%s</a> was notified that ' +
    '<a href="%s">resource</a> has changed via <i>%s</i> protocol.';

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
            if (undefined === self.data.resources) {
                self.data.resources = {};
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
            if (undefined === self.data.prefs.maxResourceSize) {
                self.data.prefs.maxResourceSize = 1024 * 250; // 250K
                dataDirty = true;
            }
            if (undefined === self.data.prefs.ctSecsResourceExpire) {
                self.data.prefs.ctSecsResourceExpire = 25 * 60 * 60; // 25 Hours
                dataDirty = true;
            }
            if (undefined === self.data.prefs.minSecsBetweenPings) {
                self.data.prefs.minSecsBetweenPings = 0;
                dataDirty = true;
            }
            if (undefined === self.data.prefs.maxEvents) {
                self.data.prefs.maxEvents = 100;
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

RssCloudSuite.prototype.initResource = function (resourceUrl) {
    var self = this, resource;
    if (undefined === self.data.resources[resourceUrl]) {
        self.data.resources[resourceUrl] = {};
    }
    resource = self.data.resources[resourceUrl];

    if (undefined === resource.flDirty) {
        resource.flDirty = true;
    }
    if (undefined === resource.lastSize) {
        resource.lastSize = 0;
    }
    if (undefined === resource.lastHash) {
        resource.lastHash = 0;
    }
    if (undefined === resource.ctChecks) {
        resource.ctChecks = 0;
    }
    if (undefined === resource.whenLastCheck) {
        resource.whenLastCheck = moment('0', 'x');
    }
    if (undefined === resource.ctUpdates) {
        resource.ctUpdates = 0;
    }
    if (undefined === resource.whenLastUpdate) {
        resource.whenLastUpdate = moment('0', 'x');
    }
    return resource;
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
        subscription.whenExpires = moment().add(self.data.prefs.ctSecsResourceExpire, 'seconds');
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

RssCloudSuite.prototype.notifyOne = function (resourceUrl, server, subscription, flLog, callback) {
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
        'form': {'url': resourceUrl}
    }, function (errorMessage, httpResponse) {
        var parts = url.parse(server);
        if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299) {
            subscription.ctErrors += 1;
            subscription.ctConsecutiveErrors += 1;
            subscription.whenLastError = moment();
            self.data.dirty = true;
            return callback(MSG_ERR_SUB_FAILED_HANDLER);
        }
        subscription.whenLastUpdate = moment();
        subscription.ctUpdates += 1;
        subscription.ctConsecutiveErrors = 0;
        if (flLog) {
            self.logEvent(
                'Notify',
                sprintf(MSG_LOG_NOTIFY, server, parts.host, resourceUrl, parts.protocol),
                startticks
            );
        }
        return callback(null);
    });
};

RssCloudSuite.prototype.notifyOneChallenge = function (resourceUrl, server, subscription, callback) {
    var self = this, challenge, testUrl;

    self.initSubscription(subscription);

    challenge = randomValueBase64(20);
    testUrl = server + '?' + querystring.stringify({
        'url': resourceUrl,
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
            return callback(MSG_ERR_SUB_FAILED_HANDLER);
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
        function checkresourceUrlStatusCodes(callback) {
            async.each(
                urlList,
                function (resourceUrl, callback) {
                    request({
                        'url': resourceUrl,
                        'method': 'HEAD'
                    }, function checkStatusCode(errorMessage, httpResponse) {
                        if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299) {
                            return callback(sprintf(MSG_ERR_SUB_READ_RESOURCE, resourceUrl));
                        }
                        return callback(null);
                    });
                },
                callback
            );
        },
        function (callback) {
            var subscription, resourceUrl;
            if (undefined === urlList[0]) {
                return callback(MSG_ERR_SUB_NO_RESOURCES);
            }
            resourceUrl = urlList[0];
            if (undefined === self.data.subscriptions[resourceUrl]) {
                self.data.subscriptions[resourceUrl] = {};
            }
            if (undefined === self.data.subscriptions[resourceUrl][apiurl]) {
                self.data.subscriptions[resourceUrl][apiurl] = {};
            }
            subscription = self.data.subscriptions[resourceUrl][apiurl];
            if (diffDomain) {
                self.notifyOneChallenge(resourceUrl, apiurl, subscription, callback);
            } else {
                self.notifyOne(resourceUrl, apiurl, subscription, false, callback);
            }
        },
        function (callback) {
            var parts;
            parts = url.parse(apiurl);
            async.each(
                urlList,
                function (resourceUrl, callback) {
                    var subscriptions, subscription;
                    if (undefined === self.data.subscriptions[resourceUrl]) {
                        self.data.subscriptions[resourceUrl] = {};
                    }
                    subscriptions = self.data.subscriptions[resourceUrl];
                    if (undefined === subscriptions[apiurl]) {
                        subscriptions[apiurl] = {};
                        self.initSubscription(subscriptions[apiurl]);
                    }
                    subscription = subscriptions[apiurl];
                    subscription.whenExpires = moment().add(self.data.prefs.ctSecsResourceExpire, 'seconds');
                    self.logEvent(
                        'Subscribe',
                        sprintf(MSG_LOG_SUB, apiurl, parts.host, resourceUrl, parts.protocol),
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
                'msg': MSG_SUCCESS_SUB
            });
        }
    ], function handleError(errorMessage) {
        return callback(errorMessage);
    });
};

RssCloudSuite.prototype.notifySubscribers = function (resourceUrl, callback) {
    var self = this, subscriptions, apiurl;

    if (undefined === self.data.subscriptions[resourceUrl]) {
        return callback(sprintf(MSG_ERR_PING_NO_SUBSCRIPTIONS, resourceUrl));
    }

    subscriptions = self.data.subscriptions[resourceUrl];

    for (apiurl in subscriptions) {
        if (subscriptions.hasOwnProperty(apiurl)) {
            self.notifyOne(resourceUrl, apiurl, subscriptions[apiurl], true);
        }
    }

    callback(null);
};

RssCloudSuite.prototype.ping = function (resourceUrl, callback) {
    var self = this,
        resource,
        minsecs,
        startticks = moment().format('x'),
        ctsecs;

    async.waterfall([
        function initializeData(callback) {
            self.init(callback);
        },
        function initializeResource(callback) {
            minsecs = self.data.prefs.minSecsBetweenPings;
            if (0 < minsecs) {
                ctsecs = moment().diff(resource.whenLastCheck, 'seconds');
                if (ctsecs < minsecs) {
                    return callback(sprintf(MSG_ERR_PING_RECENT, minsecs, ctsecs));
                }
            }
            resource = self.initResource(resourceUrl);
            resource.ctChecks += 1;
            resource.whenLastCheck = moment();
            callback(null);
        },
        function updateResource(callback) {
            request.get({
                'url': resourceUrl
            }, function (errorMessage, httpResponse, body) {
                var md5, hash;
                if (errorMessage || httpResponse.statusCode < 200 || httpResponse.statusCode > 299) {
                    callback(sprintf(MSG_ERR_PING_READ_RESOURCE, resourceUrl));
                }
                md5 = crypto.createHash('md5');
                md5.update(body);
                hash = md5.digest('hex');
                if (resource.lastHash !== hash) {
                    resource.flDirty = true;
                } else if (resource.lastSize !== body.length) {
                    resource.flDirty = true;
                } else {
                    resource.flDirty = false;
                }
                resource.lastHash = hash;
                resource.lastSize = body.length;
                self.data.dirty = true;
                callback(null);
            });
        },
        function notifySubscribers(callback) {
            self.logEvent(
                'Ping',
                sprintf(MSG_LOG_PING, resourceUrl, resource.flDirty.toString()),
                startticks
            );
            if (resource.flDirty) {
                resource.ctUpdates += 1;
                resource.whenLastUpdate = moment();
                return self.notifySubscribers(resourceUrl, callback);
            }
            callback(null);
        },
        function finished() {
            return callback(null, {
                'success': true,
                'msg': MSG_SUCCESS_PING
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
        return callback(sprintf(MSG_ERR_SUB_INVALID_PROTOCOL, protocol));
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
