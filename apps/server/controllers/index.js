const express = require('express'),
    fs = require('fs'),
    md = require('markdown-it')(),
    { createFeedsOpml } = require('../services/feeds-opml'),
    { createStats } = require('../services/stats'),
    { toFeedsJson } = require('../services/feeds-json'),
    { ping, pleaseNotify, rpc2 } = require('@rsscloud/express'),
    { core } = require('../core'),
    { generateOpml } = createFeedsOpml({ core }),
    { getStats } = createStats({ core }),
    router = new express.Router();

// Core-backed protocol front doors (@rsscloud/express driving @rsscloud/core).
// POST-bound (the package delegates method-binding to the consumer) so a GET to
// any of these paths still falls through to a 404, matching the legacy routers.
// /RPC2 handles rssCloud.hello/pleaseNotify/ping; the dispatcher never throws,
// faulting in-response on malformed or unknown calls.
router.post('/ping', ping({ core }));
router.post('/pleaseNotify', pleaseNotify({ core }));
router.post('/RPC2', rpc2({ core }));

router.use('/', require('./home'));
router.use('/docs', require('./docs'));

router.get('/LICENSE.md', (req, res) => {
    try {
        const htmltext = md.render(
            fs.readFileSync('LICENSE.md', { encoding: 'utf8' })
        );
        res.render('docs', {
            title: 'rssCloud Server: License',
            heading: 'rssCloud Server: License',
            htmltext
        });
    } catch (err) {
        console.error('Error reading LICENSE.md:', err.message);
        res.status(500).send('Internal Server Error');
    }
});
router.use('/pleaseNotifyForm', require('./please-notify-form'));
router.use('/pingForm', require('./ping-form'));
router.use('/viewLog', require('./view-log'));
router.use('/stats', require('./stats'));

router.get('/stats.json', (req, res) => {
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(getStats(), null, 2));
});

router.get('/subscriptions.json', async(req, res, next) => {
    try {
        const feeds = toFeedsJson(await core.listFeeds());
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify({ version: 2, feeds }, null, 2));
    } catch (err) {
        next(err);
    }
});

router.get('/feeds.opml', async(req, res, next) => {
    try {
        res.set('Content-Type', 'text/x-opml; charset=utf-8');
        res.send(await generateOpml());
    } catch (err) {
        next(err);
    }
});

if (process.env.ENABLE_TEST_API === 'true') {
    router.use('/test', require('./test'));
}

module.exports = router;
