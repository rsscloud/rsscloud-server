(function () {
    "use strict";

    const moment = require('moment');

    function initResource(resource) {
        const defaultResource = {
            flDirty: true,
            lastSize: 0,
            lastHash: '',
            ctChecks: 0,
            whenLastCheck: new Date(moment.utc('0', 'x').format()),
            ctUpdates: 0,
            whenLastUpdate: new Date(moment.utc('0', 'x').format())
        };

        return Object.assign({}, defaultResource, resource);
    }

    module.exports = initResource;
}());
