require('dotenv').config();

const config = require('./config'),
    cors = require('cors'),
    express = require('express'),
    exphbs = require('express-handlebars'),
    getDayjs = require('./services/dayjs-wrapper'),
    mongodb = require('./services/mongodb'),
    morgan = require('morgan'),
    { setupLogRetention } = require('./services/log-cleanup'),
    removeExpiredSubscriptions = require('./services/remove-expired-subscriptions');

let app, hbs, server, dayjs;

console.log(`${config.appName} ${config.appVersion}`);

// Schedule cleanup tasks
function scheduleCleanupTasks() {
    // Run subscription cleanup every 24 hours
    setInterval(async() => {
        try {
            console.log('Running scheduled subscription cleanup...');
            await removeExpiredSubscriptions();
        } catch (error) {
            console.error('Error in scheduled subscription cleanup:', error);
        }
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
}

morgan.format('mydate', () => {
    return new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }).replace(/:/g, ':');
});

// Initialize dayjs at startup
async function initializeDayjs() {
    dayjs = await getDayjs();
}

app = express();

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

    // Setup log retention TTL index
    try {
        await setupLogRetention();
    } catch (error) {
        console.error('Failed to setup log retention, continuing without it:', error);
    }

    // Start cleanup scheduling
    scheduleCleanupTasks();

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
