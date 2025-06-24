const config = require('../config'),
    getDayjs = require('./dayjs-wrapper');

async function initSubscription(subscriptions, notifyProcedure, apiurl, protocol) {
    const dayjs = await getDayjs();
    const defaultSubscription = {
            ctUpdates: 0,
            whenLastUpdate: new Date(dayjs.utc('0', 'x').format()),
            ctErrors: 0,
            ctConsecutiveErrors: 0,
            whenLastError: new Date(dayjs.utc('0', 'x').format()),
            whenExpires: new Date(dayjs().utc().add(config.ctSecsResourceExpire, 'seconds').format()),
            url: apiurl,
            notifyProcedure,
            protocol
        },

        index = subscriptions.pleaseNotify.findIndex(subscription => {
            return subscription.url === apiurl;
        });

    if (-1 === index) {
        subscriptions.pleaseNotify.push(defaultSubscription);
    } else {
        subscriptions.pleaseNotify[index] = Object.assign(
            {},
            defaultSubscription,
            subscriptions.pleaseNotify[index]
        );
    }

    return subscriptions;
}

module.exports = initSubscription;
