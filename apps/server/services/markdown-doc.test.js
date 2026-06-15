const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderMarkdownDoc } = require('./markdown-doc');

function writeTemp(contents) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mddoc-'));
    const file = path.join(dir, 'doc.md');
    fs.writeFileSync(file, contents);
    return file;
}

test('renders Markdown to HTML', () => {
    const file = writeTemp('# Title\n\nHello **world**');
    const html = renderMarkdownDoc(file);
    assert.match(html, /<strong>world<\/strong>/);
});

test('strips the leading H1 when stripH1 is set', () => {
    const file = writeTemp('# Documentation\n\nBody text');
    const html = renderMarkdownDoc(file, { stripH1: true });
    assert.doesNotMatch(html, /<h1/);
    assert.match(html, /<p>Body text<\/p>/);
});

test('retains the H1 by default', () => {
    const file = writeTemp('# Documentation\n\nBody text');
    const html = renderMarkdownDoc(file);
    assert.match(html, /<h1[^>]*>Documentation<\/h1>/);
});

test('throws when the file cannot be read', () => {
    assert.throws(() => renderMarkdownDoc('/no/such/file.md'));
});

test('rewrites relative .md links to in-app routes via docLinks', () => {
    const file = writeTemp('See [WebSub](docs/websub.md) for details.');
    const html = renderMarkdownDoc(file, {
        docLinks: { websub: '/docs/websub' }
    });
    assert.match(html, /href="\/docs\/websub"/);
});

test('preserves a #anchor when rewriting a .md link', () => {
    const file = writeTemp('[fan-out](cross-protocol.md#fan-out)');
    const html = renderMarkdownDoc(file, {
        docLinks: { 'cross-protocol': '/docs/cross-protocol' }
    });
    assert.match(html, /href="\/docs\/cross-protocol#fan-out"/);
});

test('maps a parent-relative README link to /docs', () => {
    const file = writeTemp('[Home](../README.md)');
    const html = renderMarkdownDoc(file, { docLinks: { README: '/docs' } });
    assert.match(html, /href="\/docs"/);
});

test('leaves unmapped and external links unchanged', () => {
    const file = writeTemp(
        '[license](LICENSE.md) [spec](https://www.w3.org/TR/websub/)'
    );
    const html = renderMarkdownDoc(file, {
        docLinks: { websub: '/docs/websub' }
    });
    assert.match(html, /href="LICENSE.md"/);
    assert.match(html, /href="https:\/\/www.w3.org\/TR\/websub\/"/);
});

test('leaves links untouched when no docLinks map is given', () => {
    const file = writeTemp('[WebSub](docs/websub.md)');
    const html = renderMarkdownDoc(file);
    assert.match(html, /href="docs\/websub.md"/);
});

test('gives headings GitHub-style ids so #fragment links resolve', () => {
    const file = writeTemp('## POST /pleaseNotify\n\nbody');
    const html = renderMarkdownDoc(file);
    assert.match(html, /<h2 id="post-pleasenotify">POST \/pleaseNotify<\/h2>/);
});

test('disambiguates repeated heading ids like GitHub', () => {
    const file = writeTemp('## Response\n\na\n\n## Response\n\nb');
    const html = renderMarkdownDoc(file);
    assert.match(html, /<h2 id="response">/);
    assert.match(html, /<h2 id="response-1">/);
});
