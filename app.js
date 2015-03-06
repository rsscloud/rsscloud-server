"use strict";

var express = require('express');
var exphbs = require('express-handlebars');
var moment = require('moment');
var nconf = require('nconf');
var packageJson = require('./package.json');
var safefs = require('./services/safefs');

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

// Assign where data struct is saved
safefs.nameStruct('data/data.json', 'data');

var app = express();

// Configure handlebars template engine to work with moment
var hbs = exphbs.create({
    helpers: {
        formatDate: function (datetime, format) {
            return moment(datetime).format(format);
        }
    }
});

// Configure express to use handlebars
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

// Handle static files in public directory
app.use(express.static('public', {
    dotfiles: 'ignore',
    maxAge: '1d'
}));

// Load controllers
app.use(require('./controllers'));

// Start server
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
