const fs = require('fs');
const md = require('markdown-it')();

// Rewrite one relative `.md` link to its in-app route using the docLinks map
// (keyed by the file's basename without extension), preserving any `#anchor`.
// External links, non-`.md` links, and basenames absent from the map are
// returned unchanged — so the same source links resolve to files on GitHub and
// to routes in the rendered docs, and unmapped targets (e.g. LICENSE.md, which
// has its own route) are left alone.
function rewriteDocLink(href, docLinks) {
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) {
        return href;
    }
    const match = /^[^?#]*?([^/?#]+)\.md(#.*)?$/.exec(href);
    if (match === null) {
        return href;
    }
    const target = docLinks[match[1]];
    return target === undefined ? href : `${target}${match[2] ?? ''}`;
}

// Slugify heading text the way GitHub does, so the in-app anchors match the
// `#fragment` links the Markdown uses (which GitHub also honours): lowercase,
// drop punctuation, spaces to hyphens.
function slugify(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\w\- ]+/g, '')
        .replace(/\s+/g, '-');
}

// A heading slug made unique within one document, mirroring GitHub's `-1`/`-2`
// suffixing for repeated headings.
function uniqueSlug(text, used) {
    const base = slugify(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
}

const renderToken = (tokens, idx, options, env, self) =>
    self.renderToken(tokens, idx, options);
const baseLinkOpen = md.renderer.rules.link_open ?? renderToken;

// Rewrite GitHub-relative `.md` links to in-app routes (when a docLinks map is
// supplied via env).
md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
    const docLinks = env && env.docLinks;
    if (docLinks) {
        const hrefIndex = tokens[idx].attrIndex('href');
        if (hrefIndex >= 0) {
            const attr = tokens[idx].attrs[hrefIndex];
            attr[1] = rewriteDocLink(attr[1], docLinks);
        }
    }
    return baseLinkOpen(tokens, idx, options, env, self);
};

// Give every heading a stable id so `#fragment` links resolve in the rendered
// docs as well as on GitHub.
md.renderer.rules.heading_open = function(tokens, idx, options, env, self) {
    if (!env.usedSlugs) {
        env.usedSlugs = new Map();
    }
    const inline = tokens[idx + 1];
    if (inline && inline.content) {
        tokens[idx].attrSet('id', uniqueSlug(inline.content, env.usedSlugs));
    }
    return self.renderToken(tokens, idx, options);
};

// Render a Markdown file to HTML for the shared `docs` view. `stripH1` drops a
// leading <h1> — the README keeps its own "# rssCloud Server" title for GitHub,
// but the docs page supplies its own heading, so the rendered H1 is redundant.
// `docLinks` rewrites relative `.md` links to in-app routes (see
// {@link rewriteDocLink}). Throws if the file can't be read; the caller maps
// that to a 500.
function renderMarkdownDoc(filePath, { stripH1 = false, docLinks = null } = {}) {
    const content = fs.readFileSync(filePath, { encoding: 'utf8' });
    const html = md.render(content, { docLinks });
    return stripH1
        ? html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '')
        : html;
}

module.exports = { renderMarkdownDoc };
