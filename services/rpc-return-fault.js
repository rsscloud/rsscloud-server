const builder = require('xmlbuilder');

function rpcReturnFault(faultCode, faultString) {
    return builder.create({
        methodResponse: {
            fault: {
                value: {
                    struct: {
                        member: [
                            {
                                name: 'faultCode',
                                value: {
                                    int: faultCode
                                }
                            },
                            {
                                name: 'faultString',
                                value: {
                                    string: faultString
                                }
                            }
                        ]
                    }
                }
            }
        }
    }).end({'pretty': true});
}

module.exports = rpcReturnFault;
