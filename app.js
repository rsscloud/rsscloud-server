(function () {
    "use strict";

    var app,
        express = require('express'),
        exphbs = require('express-handlebars'),
        hbs,
        moment = require('moment'),
        nconf = require('nconf'),
        packageJson = require('./package.json'),
        removeExpiredSubscriptions = require('./services/remove-expired-subscriptions'),
        syncStruct = require('./services/sync-struct'),
        server;

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
    syncStruct.nameStruct('data/data.json', 'data');
    syncStruct.watchStruct('data', function (err, data) {
        if (err) {
            console.error(err);
            return;
        }
        setInterval(
            function () {
                removeExpiredSubscriptions(data);
            },
            1000 * 60 * 24
        );
    });

    app = express();

    // Configure handlebars template engine to work with moment
    hbs = exphbs.create({
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
    server = app.listen(nconf.get('PORT'), function () {
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
}());
