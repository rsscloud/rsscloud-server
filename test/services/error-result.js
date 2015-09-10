(function () {
    "use strict";

    var errorResult = require('../../services/error-result.js');

    describe('services/error-result.js', function () {
        var result = errorResult('test');

        it('should return false success property', function () {
            result.should.have.property('success', false);
        });

        it('should return msg property with value test', function () {
            result.should.have.property('msg', 'test');
        });
    });
}());
