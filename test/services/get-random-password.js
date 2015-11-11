(function () {
    "use strict";

    var getRandomPassword = require('../../services/get-random-password.js');

    describe('services/get-random-password.js', function () {
        it('should return 8 digit password', function () {
            getRandomPassword(8).should.have.lengthOf(8);
        });

        it('should return 16 digit password', function () {
            getRandomPassword(16).should.have.lengthOf(16);
        });
    });
}());
