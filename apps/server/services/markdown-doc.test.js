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
