const bodyParser = require('body-parser'),
    express = require('express'),
    morgan = require('morgan'),
    packageJson = require('./package.json'),
    textParser = bodyParser.text({ type: '*/xml'}),
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
    port: getNumericConfig('PORT', 9000)
};

let app, server;

console.log(`${clientConfig.appName} ${clientConfig.appVersion}`);

morgan.format('mydate', () => {
    return new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }).replace(/:/g, ':');
});

app = express();

app.use(morgan('[:mydate] :method :url :status :res[content-length] - :remote-addr - :response-time ms'));

app.use(express.static('public', {
    dotfiles: 'ignore',
    maxAge: '1d'
}));

app.post('/RPC2', textParser, (req, res) => {
    res.send('');
});

app.get('/*', (req, res) => {
    const challenge = req.query.challenge || '';
    res.send(challenge);
});

app.post('/*', urlencodedParser, (req, res) => {
    res.send('');
});

server = app.listen(clientConfig.port, () => {
    const host = clientConfig.domain,
        port = server.address().port;

    console.log(`Listening at http://${host}:${port}`);
})
    .on('error', (error) => {
        switch (error.code) {
        case 'EADDRINUSE':
            console.log(`Error: Port ${clientConfig.port} is already in use.`);
            break;
        default:
            console.log(error.code);
        }
    });
