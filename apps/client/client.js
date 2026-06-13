const bodyParser = require('body-parser'),
    express = require('express'),
    morgan = require('morgan'),
    packageJson = require('./package.json'),
    {
        createRssCloudClient,
        buildNotifyResponse,
        renderCloudFeed
    } = require('./lib'),
    textParser = bodyParser.text({ type: '*/xml' }),
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

// All protocol wire work (pleaseNotify/ping calls, the XML-RPC notify ack, and
// <cloud> feed rendering) lives in ./lib; this file is just the UI.
const client = createRssCloudClient({ serverUrl: clientConfig.rsscloudServer });

// In-memory data stores (reset on restart)
const requestLog = [];
const feedItems = {};
const MAX_LOG_ENTRIES = 100;

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
        if (req.path.startsWith('/.well-known/')) {
            return;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.originalUrl,
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
            return `<div class="log-entry">
            <span class="method">${entry.method}</span>
            <span class="url">${escapeHtml(entry.url)}</span>
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
    </style>
</head>
<body>
    <h1>rssCloud Test Client</h1>

    <div class="controls">
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
