const express = require('express'),
    builder = require('xmlbuilder'),
    config = require('../config'),
    getDayjs = require('../services/dayjs-wrapper'),
    jsonStore = require('../services/json-store'),
    router = new express.Router();

router.use('/', require('./home'));
router.use('/docs', require('./docs'));
router.use('/pleaseNotify', require('./please-notify'));
router.use('/pleaseNotifyForm', require('./please-notify-form'));
router.use('/ping', require('./ping'));
router.use('/pingForm', require('./ping-form'));
router.use('/viewLog', require('./view-log'));
router.use('/RPC2', require('./rpc2'));
router.use('/stats', require('./stats'));

router.get('/stats.json', (req, res) => {
    const { getStats } = require('../services/stats');
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(getStats(), null, 2));
});

router.get('/subscriptions.json', (req, res) => {
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(jsonStore.getData(), null, 2));
});

router.get('/feeds.opml', async(req, res, next) => {
    try {
        const dayjs = await getDayjs();
        const nowIso = dayjs().utc().format();

        const data = jsonStore.getData();
        const outlines = [];

        for (const [feedUrl, entry] of Object.entries(data)) {
            const r = entry.resource || {};
            const text = r.feedTitle || feedUrl;
            const outline = {
                type: r.feedType || 'rss',
                text,
                xmlUrl: feedUrl
            };
            if (r.feedTitle) outline.title = r.feedTitle;
            if (r.feedDescription) outline.description = r.feedDescription;
            if (r.feedHtmlUrl) outline.htmlUrl = r.feedHtmlUrl;
            if (r.feedLanguage) outline.language = r.feedLanguage;
            outlines.push(outline);
        }

        outlines.sort((a, b) => a.text.toLowerCase().localeCompare(b.text.toLowerCase()));

        const opml = builder.create('opml', { version: '1.0', encoding: 'UTF-8' });
        opml.att('version', '2.0');
        const head = opml.ele('head');
        head.ele('title', {}, `rssCloud Server feeds (${config.domain})`);
        head.ele('dateCreated', {}, nowIso);
        const body = opml.ele('body');
        for (const o of outlines) {
            body.ele('outline', o);
        }

        res.set('Content-Type', 'text/x-opml; charset=utf-8');
        res.send(opml.end({ pretty: true }));
    } catch (err) {
        next(err);
    }
});

if (process.env.ENABLE_TEST_API === 'true') {
    router.use('/test', require('./test'));
}

module.exports = router;
