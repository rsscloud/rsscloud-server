require('dotenv').config();

const config = require('./config'),
    cors = require('cors'),
    express = require('express'),
    exphbs = require('express-handlebars'),
    getDayjs = require('./services/dayjs-wrapper'),
    { createStats } = require('./services/stats'),
    morgan = require('morgan'),
    createRemoveExpiredSubscriptions = require('./services/remove-expired-subscriptions'),
    websocket = require('./services/websocket'),
    { core, events: coreEvents } = require('./core'),
    bridgeCoreEvents = require('./services/core-event-bridge');

const stats = createStats({ core });
const removeExpiredSubscriptions = createRemoveExpiredSubscriptions({ core });

let app, hbs, server, dayjs;

console.log(`${config.appName} ${config.appVersion}`);

// Schedule cleanup tasks
function scheduleCleanupTasks() {
    // Run cleanup immediately on startup
    removeExpiredSubscriptions()
        .then(() => console.log('Startup subscription cleanup completed'))
        .catch(err =>
            console.error('Error in startup subscription cleanup:', err)
        );

    // Run subscription cleanup every 24 hours
    setInterval(
        async() => {
            try {
                console.log('Running scheduled subscription cleanup...');
                await removeExpiredSubscriptions();
            } catch (error) {
                console.error(
                    'Error in scheduled subscription cleanup:',
                    error
                );
            }
        },
        24 * 60 * 60 * 1000
    ); // 24 hours in milliseconds
}

morgan.format('mydate', () => {
    return new Date()
        .toLocaleTimeString('en-US', {
            hour12: false,
            fractionalSecondDigits: 3
        })
        .replace(/:/g, ':');
});

// Initialize dayjs at startup
async function initializeDayjs() {
    dayjs = await getDayjs();
}

app = express();

app.set('trust proxy', true);

app.use(
    morgan(
        '[:mydate] :method :url :status :res[content-length] - :remote-addr - :response-time ms'
    )
);

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
app.use(
    express.static('public', {
        dotfiles: 'ignore',
        maxAge: '1d'
    })
);

// Load controllers (includes the core-backed /ping + /pleaseNotify front doors)
app.use(require('./controllers'));

async function gracefulShutdown() {
    await core.close();
    process.exit();
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Persist data before dying on an unexpected error
process.on('uncaughtException', error => {
    console.error(
        'Uncaught exception, flushing data store before exit:',
        error
    );
    core.close().finally(() => process.exit(1));
});

process.on('unhandledRejection', reason => {
    console.error(
        'Unhandled promise rejection, flushing data store before exit:',
        reason
    );
    core.close().finally(() => process.exit(1));
});

async function startServer() {
    await initializeDayjs();

    // Start cleanup scheduling
    scheduleCleanupTasks();

    // Generate stats on startup, then schedule periodic regeneration
    stats
        .generateStats()
        .catch(err => console.error('Error generating initial stats:', err));
    stats.scheduleStatsGeneration();

    server = app
        .listen(config.port, () => {
            app.locals.host = config.domain;
            app.locals.port = server.address().port;

            if (app.locals.host.indexOf(':') > -1) {
                app.locals.host = '[' + app.locals.host + ']';
            }

            // Initialize WebSocket server for /wsLog
            websocket.initialize(server);

            // Bridge core's events onto /wsLog so /viewLog keeps working as
            // endpoints migrate onto @rsscloud/core.
            bridgeCoreEvents(coreEvents, websocket);

            console.log(
                `Listening at http://${app.locals.host}:${app.locals.port}`
            );
        })
        .on('error', error => {
            switch (error.code) {
            case 'EADDRINUSE':
                console.log(
                    `Error: Port ${config.port} is already in use.`
                );
                break;
            default:
                console.log(error.code);
            }
        });
}

startServer().catch(console.error);
