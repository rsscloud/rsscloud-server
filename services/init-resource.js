(function () {
    "use strict";

    const mongodb = require('./mongodb'),
        moment = require('moment');

    async function initResource(resourceUrl) {
        const resource = await mongodb.get()
                .collection('resources')
                .findOne({
                    _id: resourceUrl
                }),
            defaultResource = {
                _id: resourceUrl,
                flDirty: true,
                lastSize: 0,
                lastHash: '',
                ctChecks: 0,
                whenLastCheck: moment.utc('0', 'x').format(),
                ctUpdates: 0,
                whenLastUpdate: moment.utc('0', 'x').format()
            };

        return Object.assign({}, defaultResource, resourceUrl || {});
    }

    module.exports = initResource;
}());
