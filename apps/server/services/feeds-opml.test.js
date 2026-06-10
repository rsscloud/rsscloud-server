const test = require('node:test');
const assert = require('node:assert/strict');
const xml2js = require('xml2js');

const config = require('../config');
const jsonStore = require('./json-store');
const { generateOpml } = require('./feeds-opml');

async function parseOpml(xml) {
    return new xml2js.Parser().parseStringPromise(xml);
}

test.beforeEach(() => {
    jsonStore.clear();
});

test('generateOpml renders a feed with full metadata as an outline', async() => {
    jsonStore.setResource('https://a.example.com/feed.xml', {
        feedType: 'atom',
        feedTitle: 'Alpha',
        feedDescription: 'The Alpha feed',
        feedHtmlUrl: 'https://a.example.com/',
        feedLanguage: 'en-us'
    });

    const result = await parseOpml(await generateOpml());

    assert.equal(result.opml.$.version, '2.0');
    assert.equal(
        result.opml.head[0].title[0],
        `rssCloud Server feeds (${config.domain})`
    );
    const dateCreated = result.opml.head[0].dateCreated[0];
    assert.ok(!Number.isNaN(Date.parse(dateCreated)));

    const outlines = result.opml.body[0].outline;
    assert.equal(outlines.length, 1);
    assert.deepEqual(outlines[0].$, {
        type: 'atom',
        text: 'Alpha',
        xmlUrl: 'https://a.example.com/feed.xml',
        title: 'Alpha',
        description: 'The Alpha feed',
        htmlUrl: 'https://a.example.com/',
        language: 'en-us'
    });
});

test('generateOpml sorts case-insensitively and falls back to the feed URL', async() => {
    // Untitled feed: text falls back to the URL, type defaults to rss, and no
    // title/description/htmlUrl/language attributes are emitted.
    jsonStore.setResource('https://apple.example.com/feed.xml', {});
    jsonStore.setResource('https://b.example.com/feed.xml', {
        feedTitle: 'banana'
    });
    jsonStore.setResource('https://z.example.com/feed.xml', {
        feedTitle: 'Cherry'
    });

    const result = await parseOpml(await generateOpml());
    const outlines = result.opml.body[0].outline;

    assert.deepEqual(
        outlines.map(o => o.$.text),
        ['banana', 'Cherry', 'https://apple.example.com/feed.xml']
    );
    assert.deepEqual(outlines[2].$, {
        type: 'rss',
        text: 'https://apple.example.com/feed.xml',
        xmlUrl: 'https://apple.example.com/feed.xml'
    });
});

test('generateOpml lists a subscribed feed that was never pinged', async() => {
    jsonStore.setSubscriptions('https://new.example.com/feed.xml', [
        {
            url: 'http://sub.example.com/notify',
            protocol: 'http-post',
            whenExpires: new Date(Date.now() + 86400000).toISOString()
        }
    ]);

    const result = await parseOpml(await generateOpml());
    const outlines = result.opml.body[0].outline;

    assert.equal(outlines.length, 1);
    assert.deepEqual(outlines[0].$, {
        type: 'rss',
        text: 'https://new.example.com/feed.xml',
        xmlUrl: 'https://new.example.com/feed.xml'
    });
});
