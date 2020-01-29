"use strict";

var app,
    bodyParser = require('body-parser'),
    express = require('express'),
    morgan = require('morgan'),
    nconf = require('nconf'),
    packageJson = require('./package.json'),
    server,
    textParser = bodyParser.text({ type: '*/xml'}),
    urlencodedParser = bodyParser.urlencoded({ extended: false });

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

console.log(nconf.get('APP_NAME') + ' ' + nconf.get('APP_VERSION'));

morgan.format('mydate', function() {
    var df = require('dateformat');
    return df(new Date(), 'HH:MM:ss.l');
});

app = express();

app.use(morgan('[:mydate] :method :url :status :res[content-length] - :remote-addr - :response-time ms'));

app.use(urlencodedParser);

app.use(express.static('public', {
    dotfiles: 'ignore',
    maxAge: '1d'
}));

app.post('/RPC2', textParser, function (req, res) {
    console.log('post');
    console.dir(req.body);
    res.send('');
})

app.get('/*', function (req, res) {
    var challenge = req.query.challenge || "";
    console.log('get');
    console.dir(req.query);
    res.send(challenge);
});

app.post('/*', function (req, res) {
    console.log('post');
    console.dir(req.body);
    res.send('');
});

server = app.listen(nconf.get('PORT'), function () {
    var host = nconf.get('DOMAIN'),
        port = server.address().port;

    console.log('Listening at http://%s:%s', host, port);
})
    .on('error', function (error) {
        switch (error.code) {
        case 'EADDRINUSE':
            console.log('Error: Port ' + nconf.get('PORT') + ' is already in use.');
            break;
        default:
            console.log(error.code);
        }
    });
