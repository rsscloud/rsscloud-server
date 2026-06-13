const fs = require('fs');
const md = require('markdown-it')();

// Render a Markdown file to HTML for the shared `docs` view. `stripH1` drops a
// leading <h1> — the README keeps its own "# rssCloud Server" title for GitHub,
// but the docs page supplies its own heading, so the rendered H1 is redundant.
// Throws if the file can't be read; the caller maps that to a 500.
function renderMarkdownDoc(filePath, { stripH1 = false } = {}) {
    const html = md.render(fs.readFileSync(filePath, { encoding: 'utf8' }));
    return stripH1
        ? html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '')
        : html;
}

module.exports = { renderMarkdownDoc };
