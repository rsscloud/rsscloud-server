const getDayjs = require('./dayjs-wrapper');

async function initResource(resource) {
    const dayjs = await getDayjs();
    const defaultResource = {
        flDirty: true,
        lastSize: 0,
        lastHash: '',
        ctChecks: 0,
        whenLastCheck: new Date(dayjs.utc('0', 'x').format()),
        ctUpdates: 0,
        whenLastUpdate: new Date(dayjs.utc('0', 'x').format())
    };

    return Object.assign({}, defaultResource, resource);
}

module.exports = initResource;
