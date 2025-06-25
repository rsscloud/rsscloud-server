const nconf = require('nconf'),
    packageJson = require('./package.json');

// Setup nconf to use (in-order):
//   1. Overrides
//   2. Command-line arguments
//   3. Environment variables
//   4. Default values
nconf
    .overrides({
        'APP_NAME': 'rssCloudServer',
        'APP_VERSION': packageJson.version
    })
    .argv()
    .env()
    .defaults({
        'DOMAIN': 'localhost',
        'PORT': 5337,
        'MONGODB_URI': 'mongodb://localhost:27017/rsscloud',
        'MAX_CONSECUTIVE_ERRORS': 3,
        'MAX_RESOURCE_SIZE': 256000,
        'CT_SECS_RESOURCE_EXPIRE': 90000,
        'MIN_SECS_BETWEEN_PINGS': 0,
        'REQUEST_TIMEOUT': 4000,
        'LOG_RETENTION_HOURS': 2
    });

module.exports = {
    appName: nconf.get('APP_NAME'),
    appVersion: nconf.get('APP_VERSION'),
    domain: nconf.get('DOMAIN'),
    port: nconf.get('PORT'),
    mongodbUri: nconf.get('MONGODB_URI'),
    maxConsecutiveErrors: nconf.get('MAX_CONSECUTIVE_ERRORS'),
    maxResourceSize: nconf.get('MAX_RESOURCE_SIZE'),
    ctSecsResourceExpire: nconf.get('CT_SECS_RESOURCE_EXPIRE'),
    minSecsBetweenPings: nconf.get('MIN_SECS_BETWEEN_PINGS'),
    requestTimeout: nconf.get('REQUEST_TIMEOUT'),
    logRetentionHours: nconf.get('LOG_RETENTION_HOURS')
};
