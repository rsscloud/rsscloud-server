(function () {
    "use strict";

    var notifyOne = require('../../services/notify-one.js'),
        request = require('request'),
        sinon = require('sinon'),
        clock;

    describe('services/notify-one.js correct api', function () {
        before(function(done) {
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 200});
            clock = sinon.useFakeTimers();
            clock.tick(300000);
            done();
        });

        after(function(done) {
            request.post.restore();
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
            notifyOne(data, 'http://www.google.com/', 'http://192.168.0.1/', false, function (err) {
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

    describe('services/notify-one.js invalid api', function () {
        before(function(done) {
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 404});
            clock = sinon.useFakeTimers();
            clock.tick(300000);
            done();
        });

        after(function(done) {
            request.post.restore();
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
            notifyOne(data, 'http://www.google.com/', 'http://192.168.0.1/', false, function (err) {
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
