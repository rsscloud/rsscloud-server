const xml2js = require('xml2js'),
    config = require('../config');

const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: false, trim: true });

function extractText(node) {
    if (node === null || node === undefined) return null;
    if (typeof node === 'string') {
        const trimmed = node.trim();
        return trimmed.length ? trimmed : null;
    }
    if (typeof node === 'object') {
        if (typeof node._ === 'string') {
            const trimmed = node._.trim();
            return trimmed.length ? trimmed : null;
        }
        if (typeof node['#text'] === 'string') {
            const trimmed = node['#text'].trim();
            return trimmed.length ? trimmed : null;
        }
    }
    return null;
}

function pickAtomHtmlLink(linkNode) {
    if (!linkNode) return null;

    if (typeof linkNode === 'string') {
        return extractText(linkNode);
    }

    const candidates = Array.isArray(linkNode) ? linkNode : [linkNode];
    let fallback = null;

    for (const link of candidates) {
        if (typeof link === 'string') {
            if (!fallback) fallback = link.trim() || null;
            continue;
        }
        if (typeof link !== 'object') continue;

        const attrs = link.$ || {};
        const href = attrs.href;
        if (!href) continue;

        const rel = attrs.rel;
        const type = attrs.type;
        const isHtmlish = !type || type.startsWith('text/html') || type === 'application/xhtml+xml';

        if ((!rel || rel === 'alternate') && isHtmlish) {
            return href;
        }
        if (!fallback && (!rel || rel === 'alternate')) {
            fallback = href;
        }
    }

    return fallback;
}

function fromRss(channel) {
    return {
        type: 'rss',
        title: extractText(channel.title),
        description: extractText(channel.description),
        htmlUrl: extractText(channel.link),
        language: extractText(channel.language)
    };
}

function fromRdf(channel) {
    return {
        type: 'rss',
        title: extractText(channel.title),
        description: extractText(channel.description),
        htmlUrl: extractText(channel.link),
        language: extractText(channel.language) || extractText(channel['dc:language'])
    };
}

function fromAtom(feed) {
    const lang = feed.$ && (feed.$['xml:lang'] || feed.$.lang);
    return {
        type: 'atom',
        title: extractText(feed.title),
        description: extractText(feed.subtitle) || extractText(feed.tagline),
        htmlUrl: pickAtomHtmlLink(feed.link),
        language: lang ? String(lang).trim() || null : null
    };
}

async function parseFeed(body) {
    if (!body || typeof body !== 'string') return null;
    if (body.length > config.maxResourceSize) return null;

    let parsed;
    try {
        parsed = await parser.parseStringPromise(body);
    } catch {
        return null;
    }
    if (!parsed) return null;

    if (parsed.rss && parsed.rss.channel) {
        return fromRss(parsed.rss.channel);
    }
    if (parsed['rdf:RDF'] && parsed['rdf:RDF'].channel) {
        return fromRdf(parsed['rdf:RDF'].channel);
    }
    if (parsed.feed) {
        return fromAtom(parsed.feed);
    }
    return null;
}

module.exports = parseFeed;
