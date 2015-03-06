(function () {
    "use strict";

    var builder = require('xmlbuilder');

    function restReturnSuccess(success, message, element) {
        element = element || 'result';

        return builder.create(element)
            .att('success', success ? 'true' : 'false')
            .att('msg', message)
            .end({'pretty': true});
    }

    module.exports = restReturnSuccess;
}());
