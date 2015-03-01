"use strict";

var express = require('express');
var exphbs = require('express-handlebars');
var nconf = require('nconf');
var packageJson = require('./package.json');

// Setup nconf to use (in-order):
//   1. Overrides
//   2. Command-line arguments
//   3. Environment variables
//   4. Default values
nconf
    .overrides({
        'APP_NAME': 'rssCloudServer',
        'APP_VERSION': packageJson.version,
    })
    .argv()
    .env()
    .defaults({
        "PORT": 5337
    });

console.log(nconf.get('APP_NAME') + ' ' + nconf.get('APP_VERSION'));

var app = express();

app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

/*jslint nomen: true*/
app.use(express.static(__dirname + '/public'));
/*jslint nomen: false*/
app.use(require('./controllers'));

var server = app.listen(nconf.get('PORT'), function () {
    var host = server.address().address,
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
