(function () {
    "use strict";

    const builder = require('xmlbuilder');

    function rpcReturnSuccess(success) {
        return builder.create({
            methodResponse: {
                params: {
                    param: [
                        {
                            value: {
                                boolean: success ? 1 : 0
                            }
                        }
                    ]
                }
            }
        }).end({'pretty': true});
    }

    module.exports = rpcReturnSuccess;
}());
