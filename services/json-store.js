const fs = require('fs');
const path = require('path');

let data = {};
let filePath = null;
let flushTimer = null;
let flushing = false;

function initialize(dataFilePath, flushIntervalMs = 60000) {
    filePath = dataFilePath;

    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(filePath)) {
        try {
            data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            data = {};
        }
    }

    flushTimer = setInterval(() => flush(), flushIntervalMs);
}

function setResource(feedUrl, resourceObj) {
    if (!data[feedUrl]) {
        data[feedUrl] = { resource: {}, subscribers: [] };
    }
    const clean = Object.assign({}, resourceObj);
    delete clean._id;
    data[feedUrl].resource = clean;
}

function setSubscriptions(feedUrl, pleaseNotifyArray) {
    if (!data[feedUrl]) {
        data[feedUrl] = { resource: {}, subscribers: [] };
    }
    data[feedUrl].subscribers = pleaseNotifyArray.map(sub => {
        const clean = Object.assign({}, sub);
        delete clean._id;
        return clean;
    });
}

function getData() {
    return data;
}

function clear() {
    data = {};
}

function flush() {
    if (!filePath || flushing) {
        return;
    }
    flushing = true;
    try {
        const tmpPath = filePath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
        fs.renameSync(tmpPath, filePath);
    } finally {
        flushing = false;
    }
}

function shutdown() {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    flush();
}

module.exports = {
    initialize,
    setResource,
    setSubscriptions,
    getData,
    clear,
    flush,
    shutdown
};
