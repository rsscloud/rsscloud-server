(function () {
    "use strict";

    var crypto = require('crypto'),
        notifyOneChallenge = require('../../services/notify-one-challenge.js'),
        request = require('request'),
        sinon = require('sinon'),
        clock;

    describe('services/notify-one-challenge.js correct api', function () {
        before(function(done) {
            sinon
                .stub(crypto, 'randomBytes')
                .returns('CHALLENGE');
            sinon
                .stub(request, 'get')
                .yields(null, {statusCode: 200}, 'CHALLENGE');
            clock = sinon.useFakeTimers();
            clock.tick(300000);
            done();
        });

        after(function(done) {
            crypto.randomBytes.restore();
            request.get.restore();
            clock.restore();
            done();
        });

        it('should notify api correctly', function (done) {
            var data = {
                subscriptions: {},
                prefs: {
                    ctSecsResourceExpire: 25 * 60 * 60
                }
            };
            notifyOneChallenge(data, 'http://www.google.com/', 'http://192.168.0.1/', function (err) {
                if (err) { return done(err); }
                data.subscriptions.should.have.property('http://www.google.com/');
                data.subscriptions['http://www.google.com/'].should.have.property('http://192.168.0.1/');
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/']
                    .should.have.property('ctUpdates', 1);
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/']
                    .should.have.property('ctConsecutiveErrors', 0);
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/'].whenLastUpdate.unix()
                    .should.equal(300);
                done();
            });
        });
    });

    describe('services/notify-one-challenge.js invalid api', function () {
        before(function(done) {
            sinon
                .stub(request, 'get')
                .yields(null, {statusCode: 404});
            clock = sinon.useFakeTimers();
            clock.tick(300000);
            done();
        });

        after(function(done) {
            request.get.restore();
            clock.restore();
            done();
        });

        it('should fail to notify api correctly', function (done) {
            var data = {
                subscriptions: {},
                prefs: {
                    ctSecsResourceExpire: 25 * 60 * 60
                }
            };
            notifyOneChallenge(data, 'http://www.google.com/', 'http://192.168.0.1/', function (err) {
                err.should.not.be.empty;
                data.subscriptions.should.have.property('http://www.google.com/');
                data.subscriptions['http://www.google.com/'].should.have.property('http://192.168.0.1/');
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/']
                    .should.have.property('ctErrors', 1);
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/']
                    .should.have.property('ctConsecutiveErrors', 1);
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/'].whenLastError.unix()
                    .should.equal(300);
                done();
            });
        });
    });

    describe('services/notify-one-challenge.js invalid challenge', function () {
        before(function(done) {
            sinon
                .stub(request, 'get')
                .yields(null, {statusCode: 200});
            clock = sinon.useFakeTimers();
            clock.tick(300000);
            done();
        });

        after(function(done) {
            request.get.restore();
            clock.restore();
            done();
        });

        it('should fail to notify api correctly', function (done) {
            var data = {
                subscriptions: {},
                prefs: {
                    ctSecsResourceExpire: 25 * 60 * 60
                }
            };
            notifyOneChallenge(data, 'http://www.google.com/', 'http://192.168.0.1/', function (err) {
                err.should.not.be.empty;
                data.subscriptions.should.have.property('http://www.google.com/');
                data.subscriptions['http://www.google.com/'].should.have.property('http://192.168.0.1/');
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/']
                    .should.have.property('ctErrors', 1);
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/']
                    .should.have.property('ctConsecutiveErrors', 1);
                data.subscriptions['http://www.google.com/']['http://192.168.0.1/'].whenLastError.unix()
                    .should.equal(300);
                done();
            });
        });
    });
}());
