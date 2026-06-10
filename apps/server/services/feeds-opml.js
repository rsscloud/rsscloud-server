const builder = require('xmlbuilder');
const config = require('../config');
const getDayjs = require('./dayjs-wrapper');
const jsonStore = require('./json-store');

// Builds the `/feeds.opml` document: every tracked feed as an <outline>,
// sorted case-insensitively by display text. The controller owns the HTTP
// response (Content-Type + error forwarding); this returns the XML string.
async function generateOpml() {
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

    outlines.sort((a, b) =>
        a.text.toLowerCase().localeCompare(b.text.toLowerCase())
    );

    const opml = builder.create('opml', {
        version: '1.0',
        encoding: 'UTF-8'
    });
    opml.att('version', '2.0');
    const head = opml.ele('head');
    head.ele('title', {}, `rssCloud Server feeds (${config.domain})`);
    head.ele('dateCreated', {}, nowIso);
    const body = opml.ele('body');
    for (const o of outlines) {
        body.ele('outline', o);
    }

    return opml.end({ pretty: true });
}

module.exports = { generateOpml };
