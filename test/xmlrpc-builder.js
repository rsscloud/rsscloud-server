const builder = require('xmlbuilder');

function buildPingCall(resourceUrl = null) {
    const methodCall = {
        methodCall: {
            methodName: 'rssCloud.ping'
        }
    };

    if (resourceUrl !== null) {
        methodCall.methodCall.params = {
            param: {
                value: {
                    string: resourceUrl
                }
            }
        };
    } else {
        methodCall.methodCall.params = {};
    }

    return builder.create(methodCall).end({ pretty: true });
}

function buildPleaseNotifyCall(params) {
    const methodCall = {
        methodCall: {
            methodName: 'rssCloud.pleaseNotify',
            params: {
                param: []
            }
        }
    };

    // Parameter order: notifyProcedure, port, path, protocol, urlList, domain (optional)
    const [notifyProcedure, port, path, protocol, urlList, domain] = params;

    // Add notifyProcedure (string)
    methodCall.methodCall.params.param.push({
        value: {
            string: notifyProcedure
        }
    });

    // Add port (integer)
    methodCall.methodCall.params.param.push({
        value: {
            i4: port
        }
    });

    // Add path (string)
    methodCall.methodCall.params.param.push({
        value: {
            string: path
        }
    });

    // Add protocol (string)
    methodCall.methodCall.params.param.push({
        value: {
            string: protocol
        }
    });

    // Add urlList (array)
    const arrayData = {
        data: []
    };

    if (Array.isArray(urlList)) {
        urlList.forEach(url => {
            arrayData.data.push({
                value: {
                    string: url
                }
            });
        });
    } else {
        // Single URL
        arrayData.data.push({
            value: {
                string: urlList
            }
        });
    }

    methodCall.methodCall.params.param.push({
        value: {
            array: arrayData
        }
    });

    // Add domain (string, optional)
    if (domain !== undefined) {
        methodCall.methodCall.params.param.push({
            value: {
                string: domain
            }
        });
    }

    return builder.create(methodCall).end({ pretty: true });
}

module.exports = {
    buildPingCall,
    buildPleaseNotifyCall
};
