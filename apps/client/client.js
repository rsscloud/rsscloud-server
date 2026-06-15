const bodyParser = require('body-parser'),
    crypto = require('crypto'),
    express = require('express'),
    morgan = require('morgan'),
    packageJson = require('./package.json'),
    {
        createRssCloudClient,
        createWebSubClient,
        readVerification,
        buildNotifyResponse,
        renderCloudFeed
    } = require('./lib'),
    textParser = bodyParser.text({ type: '*/xml' }),
    // Content distribution arrives with the origin feed's Content-Type relayed
    // verbatim, so the callback parses any media type as a raw string to log it.
    rawTextParser = bodyParser.text({ type: () => true }),
    urlencodedParser = bodyParser.urlencoded({ extended: false });

// Simple config utility
function getConfig(key, defaultValue) {
    return process.env[key] ?? defaultValue;
}

function getNumericConfig(key, defaultValue) {
    const value = process.env[key];
    return value ? parseInt(value, 10) : defaultValue;
}

const clientConfig = {
    appName: 'rssCloudClient',
    appVersion: packageJson.version,
    domain: getConfig('DOMAIN', 'localhost'),
    port: getNumericConfig('PORT', 9000),
    rsscloudServer: 'http://localhost:5337'
};

// The hub's WebSub front door, advertised in feeds via <atom:link rel="hub">.
clientConfig.hubUrl = `${clientConfig.rsscloudServer}/websub`;
// The path the hub verifies and delivers WebSub content to on this harness.
const WEBSUB_CALLBACK_PATH = '/websub-callback';

// All protocol wire work (pleaseNotify/ping calls, WebSub hub.* calls, the
// XML-RPC notify ack, and <cloud>/atom feed rendering) lives in ./lib; this file
// is just the UI.
const client = createRssCloudClient({ serverUrl: clientConfig.rsscloudServer });
const webSubClient = createWebSubClient({
    serverUrl: clientConfig.rsscloudServer
});

// In-memory data stores (reset on restart)
const requestLog = [];
const feedItems = {};
// Secrets supplied on WebSub subscribe, keyed by topic URL, so the callback can
// check the hub's X-Hub-Signature on delivery.
const webSubSecrets = {};
const MAX_LOG_ENTRIES = 100;

// The callback URL this harness registers with the hub for a feed.
function webSubCallbackUrl() {
    return `http://${clientConfig.domain}:${clientConfig.port}${WEBSUB_CALLBACK_PATH}`;
}

// Pull the topic URL out of a delivery's Link header (`<url>; rel="self"`).
function selfLink(link) {
    const match = /<([^>]+)>\s*;\s*rel="self"/.exec(link || '');
    return match ? match[1] : undefined;
}

// Verify a relayed X-Hub-Signature (`<algo>=<hex>`) against the body using the
// secret we subscribed with. Returns a human-readable verdict for the log.
function checkSignature(topicUrl, signature, body) {
    const secret = webSubSecrets[topicUrl];
    if (!secret) {
        return 'no stored secret — not verified';
    }
    const [algo, digest] = String(signature).split('=');
    if (!algo || !digest) {
        return 'malformed header';
    }
    let expected;
    try {
        expected = crypto.createHmac(algo, secret).update(body).digest('hex');
    } catch {
        return `unsupported algorithm: ${algo}`;
    }
    return expected === digest ? 'valid ✓' : 'INVALID ✗';
}

let app, server;

console.log(`${clientConfig.appName} ${clientConfig.appVersion}`);

morgan.format('mydate', () => {
    return new Date()
        .toLocaleTimeString('en-US', {
            hour12: false,
            fractionalSecondDigits: 3
        })
        .replace(/:/g, ':');
});

app = express();

app.use(
    morgan(
        '[:mydate] :method :url :status :res[content-length] - :remote-addr - :response-time ms'
    )
);

// Handle static files in public directory
app.use(
    express.static('public', {
        dotfiles: 'ignore',
        maxAge: '1d'
    })
);

// Request logging middleware - captures all incoming requests
app.use((req, res, next) => {
    // Log request after body is parsed
    res.on('finish', () => {
        // Don't log client UI requests to keep log clean
        if (req.path === '/' && req.method === 'GET') {
            return;
        }
        if (req.path === '/subscribe' || req.path === '/ping-feed') {
            return;
        }
        // WebSub UI actions are outbound; only hub -> harness traffic is logged.
        if (
            req.path === '/websub-subscribe' ||
            req.path === '/websub-unsubscribe' ||
            req.path === '/websub-publish'
        ) {
            return;
        }
        if (req.path.startsWith('/.well-known/')) {
            return;
        }

        // Surface the WebSub delivery headers so the hub/self links and the
        // signature (with our verdict) are visible in the log.
        const headers = {};
        if (req.headers.link) {
            headers.Link = req.headers.link;
        }
        if (req.headers['x-hub-signature']) {
            const topic = selfLink(req.headers.link);
            headers['X-Hub-Signature'] =
                `${req.headers['x-hub-signature']} (${checkSignature(
                    topic,
                    req.headers['x-hub-signature'],
                    req.body
                )})`;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.originalUrl,
            headers: Object.keys(headers).length ? headers : null,
            body: req.body || null
        };

        requestLog.unshift(logEntry);

        // Cap the log size
        if (requestLog.length > MAX_LOG_ENTRIES) {
            requestLog.pop();
        }
    });

    next();
});

// Helper function to escape HTML entities
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper function to format request body for display
function formatBody(body) {
    if (!body) return '';
    // If it's a string (e.g., XML), display as-is (escaped)
    if (typeof body === 'string') {
        return escapeHtml(body);
    }
    // If it's an object (e.g., form data), display as JSON
    return escapeHtml(JSON.stringify(body));
}

// Helper function to generate HTML page
function generateHtmlPage() {
    const logHtml = requestLog
        .map(entry => {
            const bodyDisplay = formatBody(entry.body);
            const headersDisplay = entry.headers
                ? Object.entries(entry.headers)
                    .map(
                        ([key, value]) =>
                            `<div class="header"><strong>${escapeHtml(
                                key
                            )}:</strong> ${escapeHtml(String(value))}</div>`
                    )
                    .join('')
                : '';
            return `<div class="log-entry">
            <span class="method">${entry.method}</span>
            <span class="url">${escapeHtml(entry.url)}</span>
            ${headersDisplay ? `<div class="headers">${headersDisplay}</div>` : ''}
            ${bodyDisplay ? `<pre class="body">${bodyDisplay}</pre>` : ''}
            <span class="timestamp">${entry.timestamp}</span>
        </div>`;
        })
        .join('\n');

    return `<!DOCTYPE html>
<html>
<head>
    <title>rssCloud Test Client</title>
    <style>
        body {
            font-family: monospace;
            max-width: 900px;
            margin: 20px auto;
            padding: 0 20px;
        }
        h1 { margin-bottom: 20px; }
        .controls {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .controls form {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .controls label {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .controls input[type="text"] {
            padding: 8px;
            font-family: monospace;
            width: 200px;
        }
        .controls button {
            padding: 8px 16px;
            cursor: pointer;
            font-family: monospace;
        }
        .log-container {
            border: 1px solid #ccc;
            border-radius: 5px;
        }
        .log-entry {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .log-entry:last-child {
            border-bottom: none;
        }
        .method {
            display: inline-block;
            width: 50px;
            font-weight: bold;
            color: #0066cc;
        }
        .url {
            color: #333;
        }
        .body {
            margin: 5px 0 5px 55px;
            padding: 5px;
            background: #f9f9f9;
            font-size: 12px;
            overflow-x: auto;
        }
        .timestamp {
            display: block;
            margin-left: 55px;
            color: #999;
            font-size: 11px;
        }
        .empty-log {
            padding: 20px;
            text-align: center;
            color: #999;
        }
        .result {
            margin-top: 10px;
            padding: 10px;
            border-radius: 5px;
        }
        .result.success { background: #d4edda; }
        .result.error { background: #f8d7da; }
        .headers {
            margin: 5px 0 5px 55px;
            font-size: 11px;
            color: #555;
        }
        .header { word-break: break-all; }
        .controls h3 {
            margin: 0 0 10px;
            font-size: 13px;
            color: #666;
        }
        .controls + .controls { margin-top: -10px; }
    </style>
</head>
<body>
    <h1>rssCloud Test Client</h1>

    <div class="controls">
        <h3>rssCloud</h3>
        <form method="POST" id="actionForm">
            <label>
                <input type="checkbox" name="xmlrpc" id="xmlrpc">
                XML-RPC
            </label>
            <input type="text" name="feedName" id="feedName" value="rss-01.xml" placeholder="Feed name">
            <button type="submit" formaction="/subscribe">Subscribe</button>
            <button type="submit" formaction="/ping-feed">Ping</button>
        </form>
    </div>

    <div class="controls">
        <h3>WebSub</h3>
        <form method="POST" id="websubForm">
            <input type="text" name="feedName" value="rss-01.xml" placeholder="Feed name">
            <input type="text" name="leaseSeconds" placeholder="lease_seconds (optional)">
            <input type="text" name="secret" placeholder="secret (optional)">
            <button type="submit" formaction="/websub-subscribe">Subscribe</button>
            <button type="submit" formaction="/websub-unsubscribe">Unsubscribe</button>
            <button type="submit" formaction="/websub-publish">Publish</button>
        </form>
    </div>

    <h2>Incoming Requests</h2>
    <div class="log-container">
        ${logHtml || '<div class="empty-log">No requests logged yet. Subscribe to a feed and ping it to see activity.</div>'}
    </div>

    <p style="margin-top: 20px; color: #666;">
        Refresh page to see new requests. Server: ${clientConfig.rsscloudServer}
    </p>
</body>
</html>`;
}

// Route: Home page with UI
app.get('/', (req, res) => {
    res.type('html').send(generateHtmlPage());
});

// Route: Subscribe to feed notifications
app.post('/subscribe', urlencodedParser, async(req, res) => {
    const feedName = req.body.feedName || 'rss-01.xml';
    const useXmlRpc = req.body.xmlrpc === 'on';
    const feedUrl = `http://${clientConfig.domain}:${clientConfig.port}/${feedName}`;

    try {
        const { status, body } = await client.pleaseNotify({
            protocol: useXmlRpc ? 'xml-rpc' : 'http-post',
            callback: {
                domain: clientConfig.domain,
                port: clientConfig.port,
                path: useXmlRpc ? '/RPC2' : '/notify'
            },
            feedUrl
        });

        res.type('html').send(`
            <!DOCTYPE html>
            <html>
            <head><title>Subscribe Result</title></head>
            <body style="font-family: monospace; padding: 20px;">
                <h2>Subscribe Result</h2>
                <p><strong>Feed:</strong> ${escapeHtml(feedUrl)}</p>
                <p><strong>Protocol:</strong> ${useXmlRpc ? 'XML-RPC' : 'REST'}</p>
                <p><strong>Status:</strong> ${status}</p>
                <pre style="background: #f5f5f5; padding: 10px; overflow: auto;">${escapeHtml(body)}</pre>
                <p><a href="/">Back to client</a></p>
            </body>
            </html>
        `);
    } catch (error) {
        res.type('html').send(`
            <!DOCTYPE html>
            <html>
            <head><title>Subscribe Error</title></head>
            <body style="font-family: monospace; padding: 20px;">
                <h2>Subscribe Error</h2>
                <p style="color: red;">${escapeHtml(error.message)}</p>
                <p><a href="/">Back to client</a></p>
            </body>
            </html>
        `);
    }
});

// Route: Ping feed (add item and notify)
app.post('/ping-feed', urlencodedParser, async(req, res) => {
    const feedName = req.body.feedName || 'rss-01.xml';
    const useXmlRpc = req.body.xmlrpc === 'on';
    const feedUrl = `http://${clientConfig.domain}:${clientConfig.port}/${feedName}`;

    // Initialize feed if not exists
    if (!feedItems[feedName]) {
        feedItems[feedName] = [{ title: 'initialized', timestamp: new Date() }];
    }

    // Add new item with timestamp
    const now = new Date();
    feedItems[feedName].unshift({
        title: `Update at ${now.toISOString()}`,
        timestamp: now
    });

    try {
        const { status, body } = await client.ping({
            feedUrl,
            transport: useXmlRpc ? 'xml-rpc' : 'rest'
        });

        res.type('html').send(`
            <!DOCTYPE html>
            <html>
            <head><title>Ping Result</title></head>
            <body style="font-family: monospace; padding: 20px;">
                <h2>Ping Result</h2>
                <p><strong>Feed:</strong> ${escapeHtml(feedUrl)}</p>
                <p><strong>Protocol:</strong> ${useXmlRpc ? 'XML-RPC' : 'REST'}</p>
                <p><strong>Items in feed:</strong> ${feedItems[feedName].length}</p>
                <p><strong>Status:</strong> ${status}</p>
                <pre style="background: #f5f5f5; padding: 10px; overflow: auto;">${escapeHtml(body)}</pre>
                <p><a href="/">Back to client</a></p>
            </body>
            </html>
        `);
    } catch (error) {
        res.type('html').send(`
            <!DOCTYPE html>
            <html>
            <head><title>Ping Error</title></head>
            <body style="font-family: monospace; padding: 20px;">
                <h2>Ping Error</h2>
                <p style="color: red;">${escapeHtml(error.message)}</p>
                <p><a href="/">Back to client</a></p>
            </body>
            </html>
        `);
    }
});

// Render a simple result/error page for a WebSub UI action.
function webSubResultPage(action, feedUrl, status, body) {
    return `
        <!DOCTYPE html>
        <html>
        <head><title>WebSub ${action} Result</title></head>
        <body style="font-family: monospace; padding: 20px;">
            <h2>WebSub ${action} Result</h2>
            <p><strong>Topic:</strong> ${escapeHtml(feedUrl)}</p>
            <p><strong>Status:</strong> ${status} ${status === 202 ? '(accepted — verification/fan-out is async)' : ''}</p>
            ${body ? `<pre style="background: #f5f5f5; padding: 10px; overflow: auto;">${escapeHtml(body)}</pre>` : ''}
            <p><a href="/">Back to client</a></p>
        </body>
        </html>
    `;
}

function webSubErrorPage(action, error) {
    return `
        <!DOCTYPE html>
        <html>
        <head><title>WebSub ${action} Error</title></head>
        <body style="font-family: monospace; padding: 20px;">
            <h2>WebSub ${action} Error</h2>
            <p style="color: red;">${escapeHtml(error.message)}</p>
            <p><a href="/">Back to client</a></p>
        </body>
        </html>
    `;
}

// Parse an optional positive-integer lease from the form, else undefined.
function parseLease(value) {
    const seconds = parseInt(value, 10);
    return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

// Route: WebSub subscribe (hub.mode=subscribe)
app.post('/websub-subscribe', urlencodedParser, async(req, res) => {
    const feedName = req.body.feedName || 'rss-01.xml';
    const feedUrl = `http://${clientConfig.domain}:${clientConfig.port}/${feedName}`;
    const secret = req.body.secret || undefined;

    // Remember the secret so the callback can verify the delivery signature.
    if (secret) {
        webSubSecrets[feedUrl] = secret;
    } else {
        delete webSubSecrets[feedUrl];
    }

    try {
        const { status, body } = await webSubClient.subscribe({
            callbackUrl: webSubCallbackUrl(),
            topicUrl: feedUrl,
            leaseSeconds: parseLease(req.body.leaseSeconds),
            secret
        });
        res.type('html').send(
            webSubResultPage('Subscribe', feedUrl, status, body)
        );
    } catch (error) {
        res.type('html').send(webSubErrorPage('Subscribe', error));
    }
});

// Route: WebSub unsubscribe (hub.mode=unsubscribe)
app.post('/websub-unsubscribe', urlencodedParser, async(req, res) => {
    const feedName = req.body.feedName || 'rss-01.xml';
    const feedUrl = `http://${clientConfig.domain}:${clientConfig.port}/${feedName}`;
    delete webSubSecrets[feedUrl];

    try {
        const { status, body } = await webSubClient.unsubscribe({
            callbackUrl: webSubCallbackUrl(),
            topicUrl: feedUrl
        });
        res.type('html').send(
            webSubResultPage('Unsubscribe', feedUrl, status, body)
        );
    } catch (error) {
        res.type('html').send(webSubErrorPage('Unsubscribe', error));
    }
});

// Route: WebSub publish (hub.mode=publish) — mutate the feed, then notify the
// hub so it re-fetches and fans the change out to subscribers.
app.post('/websub-publish', urlencodedParser, async(req, res) => {
    const feedName = req.body.feedName || 'rss-01.xml';
    const feedUrl = `http://${clientConfig.domain}:${clientConfig.port}/${feedName}`;

    if (!feedItems[feedName]) {
        feedItems[feedName] = [{ title: 'initialized', timestamp: new Date() }];
    }
    const now = new Date();
    feedItems[feedName].unshift({
        title: `Update at ${now.toISOString()}`,
        timestamp: now
    });

    try {
        const { status, body } = await webSubClient.publish({
            topicUrl: feedUrl
        });
        res.type('html').send(
            webSubResultPage('Publish', feedUrl, status, body)
        );
    } catch (error) {
        res.type('html').send(webSubErrorPage('Publish', error));
    }
});

// Route: WebSub intent verification — the hub GETs the callback with a
// hub.challenge the subscriber must echo verbatim to confirm the subscription.
app.get(WEBSUB_CALLBACK_PATH, (req, res) => {
    const verification = readVerification(req.query);
    if (verification) {
        res.send(verification.challenge);
        return;
    }
    res.status(404).send('Not a WebSub verification');
});

// Route: WebSub content distribution — the hub POSTs the full feed body here.
// The request-logging middleware records the body, the hub/self Link header, and
// the signature verdict; we just acknowledge with a 2xx.
app.post(WEBSUB_CALLBACK_PATH, rawTextParser, (req, res) => {
    res.status(204).end();
});

// Route: Handle challenge verification for http-post subscriptions
app.get('/notify', (req, res) => {
    const challenge = req.query.challenge || '';
    res.send(challenge);
});

// Route: Handle HTTP-POST notifications
app.post('/notify', urlencodedParser, (req, res) => {
    // Body is already logged by middleware
    res.send('');
});

// Route: Handle XML-RPC notifications
app.post('/RPC2', textParser, (req, res) => {
    // Body is already logged by middleware; acknowledge with the boolean reply.
    res.type('text/xml').send(buildNotifyResponse());
});

// Route: Serve RSS feeds (must be after specific routes)
app.get('/:feedName', (req, res) => {
    const feedName = req.params.feedName;

    // Only serve .xml files as RSS feeds
    if (!feedName.endsWith('.xml')) {
        res.status(404).send('Not found');
        return;
    }

    const items = feedItems[feedName] || [
        { title: 'initialized', timestamp: new Date() }
    ];
    const feedUrl = `http://${clientConfig.domain}:${clientConfig.port}/${feedName}`;

    const rssXml = renderCloudFeed({
        title: `Test Feed: ${feedName}`,
        link: feedUrl,
        description: 'Test feed for rssCloud',
        cloud: {
            domain: 'localhost',
            port: 5337,
            path: '/RPC2',
            registerProcedure: 'rssCloud.pleaseNotify',
            protocol: 'xml-rpc'
        },
        hub: clientConfig.hubUrl,
        items: items.map((item, index) => ({
            title: item.title,
            description: `Feed item: ${item.title}`,
            pubDate: item.timestamp,
            guid: `${feedName}-${index}`
        }))
    });
    res.type('application/rss+xml').send(rssXml);
});

server = app
    .listen(clientConfig.port, () => {
        const host = clientConfig.domain,
            port = server.address().port;

        console.log(`Listening at http://${host}:${port}`);
    })
    .on('error', error => {
        switch (error.code) {
        case 'EADDRINUSE':
            console.log(
                `Error: Port ${clientConfig.port} is already in use.`
            );
            break;
        default:
            console.log(error.code);
        }
    });
