require('dotenv').config();

const config = require('./config'),
    cors = require('cors'),
    express = require('express'),
    exphbs = require('express-handlebars'),
    getDayjs = require('./services/dayjs-wrapper'),
    mongodb = require('./services/mongodb'),
    morgan = require('morgan');
    // removeExpiredSubscriptions = require('./services/remove-expired-subscriptions');

let app, hbs, server, dayjs;

require('console-stamp')(console, 'HH:MM:ss.l');

console.log(`${config.appName} ${config.appVersion}`);

// TODO: Every 24 hours run removeExpiredSubscriptions(data);

morgan.format('mydate', () => {
    const df = require('dateformat');
    return df(new Date(), 'HH:MM:ss.l');
});

// Initialize dayjs at startup
async function initializeDayjs() {
    dayjs = await getDayjs();
}

app = express();
require('express-ws')(app);

app.use(morgan('[:mydate] :method :url :status :res[content-length] - :remote-addr - :response-time ms'));

app.use(cors());

// Configure handlebars template engine to work with dayjs
hbs = exphbs.create({
    helpers: {
        formatDate: (datetime, format) => {
            return dayjs(datetime).format(format);
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
async function startServer() {
    await initializeDayjs();
    await mongodb.connect('rsscloud', config.mongodbUri);
    
    server = app.listen(config.port, () => {
        app.locals.host = config.domain;
        app.locals.port = server.address().port;

        if (app.locals.host.indexOf(':') > -1) {
            app.locals.host = '[' + app.locals.host + ']';
        }

        console.log(`Listening at http://${app.locals.host}:${app.locals.port}`);
    })
        .on('error', (error) => {
            switch (error.code) {
            case 'EADDRINUSE':
                console.log(`Error: Port ${config.port} is already in use.`);
                break;
            default:
                console.log(error.code);
            }
        });
}

startServer().catch(console.error);
