(function () {
    "use strict";

    require('dotenv').config();

    const config = require('./config'),
        cors = require('cors'),
        express = require('express'),
        exphbs = require('express-handlebars'),
        fs = require('fs'),
        moment = require('moment'),
        mongodb = require('./services/mongodb'),
        morgan = require('morgan'),
        removeExpiredSubscriptions = require('./services/remove-expired-subscriptions');

    let app,
        expressWs,
        hbs,
        server;

    require('console-stamp')(console, 'HH:MM:ss.l');

    console.log(`${config.appName} ${config.appVersion}`);

    // TODO: Every 24 hours run removeExpiredSubscriptions(data);

    morgan.format('mydate', function() {
        var df = require('dateformat');
        return df(new Date(), 'HH:MM:ss.l');
    });

    app = express();
    expressWs = require('express-ws')(app);

    app.use(morgan('[:mydate] :method :url :status :res[content-length] - :remote-addr - :response-time ms'));

    app.use(cors());

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
    mongodb.connect('rsscloud', config.mongodbUri)
        .then(() => {
            server = app.listen(config.port, function () {
                app.locals.host = config.domain;
                app.locals.port = server.address().port;

                if (app.locals.host.indexOf(':') > -1) {
                    app.locals.host = '[' + app.locals.host + ']';
                }

                console.log('Listening at http://%s:%s', app.locals.host, app.locals.port);
            })
                .on('error', function (error) {
                    switch (error.code) {
                    case 'EADDRINUSE':
                        console.log(`Error: Port ${config.port} is already in use.`);
                        break;
                    default:
                        console.log(error.code);
                    }
                });
        });
}());
