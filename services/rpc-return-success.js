(function () {
    "use strict";

    const builder = require('xmlbuilder');

    function rpcReturnSuccess() {
        return builder.create('response')
            .att('success', 'true')
            .end({'pretty': true});
    }

    module.exports = rpcReturnSuccess;
}());
