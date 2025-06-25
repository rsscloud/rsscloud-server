const bodyParser = require('body-parser'),
    express = require('express'),
    morgan = require('morgan'),
    nconf = require('nconf'),
    packageJson = require('./package.json'),
    textParser = bodyParser.text({ type: '*/xml'}),
    urlencodedParser = bodyParser.urlencoded({ extended: false });

let app, server;

require('console-stamp')(console, 'HH:MM:ss.l');

// Setup nconf to use (in-order):
//   1. Overrides
//   2. Command-line arguments
//   3. Environment variables
//   4. A config.json file
//   5. Default values
nconf
    .overrides({
        'APP_NAME': 'rssCloudClient',
        'APP_VERSION': packageJson.version,
    })
    .argv()
    .env()
    .defaults({
        "DOMAIN": "localhost",
        "PORT": 9000
    });

console.log(`${nconf.get('APP_NAME')} ${nconf.get('APP_VERSION')}`);

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
    console.log('rpc');
    console.dir(req.body);
    res.send('');
});

app.get('/*', (req, res) => {
    const challenge = req.query.challenge || "";
    console.log('get');
    console.dir(req.query);
    res.send(challenge);
});

app.post('/*', urlencodedParser, (req, res) => {
    console.log('post');
    console.dir(req.body);
    res.send('');
});

server = app.listen(nconf.get('PORT'), () => {
    const host = nconf.get('DOMAIN'),
        port = server.address().port;

    console.log(`Listening at http://${host}:${port}`);
})
    .on('error', (error) => {
        switch (error.code) {
        case 'EADDRINUSE':
            console.log(`Error: Port ${nconf.get('PORT')} is already in use.`);
            break;
        default:
            console.log(error.code);
        }
    });
