(function () {
    "use strict";

    var moment = require('moment');

    function initResource(data, resourceUrl) {
        var dirty = false, resource;

        if (undefined === data.resources[resourceUrl]) {
            data.resources[resourceUrl] = {};
        }
        resource = data.resources[resourceUrl];

        if (undefined === resource.flDirty) {
            resource.flDirty = true;
            dirty = true;
        }
        if (undefined === resource.lastSize) {
            resource.lastSize = 0;
            dirty = true;
        }
        if (undefined === resource.lastHash) {
            resource.lastHash = 0;
            dirty = true;
        }
        if (undefined === resource.ctChecks) {
            resource.ctChecks = 0;
            dirty = true;
        }
        if (undefined === resource.whenLastCheck) {
            resource.whenLastCheck = moment('0', 'x');
            dirty = true;
        }
        if (undefined === resource.ctUpdates) {
            resource.ctUpdates = 0;
            dirty = true;
        }
        if (undefined === resource.whenLastUpdate) {
            resource.whenLastUpdate = moment('0', 'x');
            dirty = true;
        }

        if (true === dirty) {
            data.dirty = true;
        }

        return resource;
    }

    module.exports = initResource;
}());
