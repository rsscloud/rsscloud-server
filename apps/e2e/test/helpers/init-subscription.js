const getDayjs = require('./dayjs-wrapper');

const ctSecsResourceExpire =
    parseInt(process.env.CT_SECS_RESOURCE_EXPIRE, 10) || 90000;

// Build a core-model subscription (the JsonSubscription wire shape) onto the
// `subscriptions` array: `null` marks "never", whenCreated is recorded, and a
// REST subscription carries no notifyProcedure (string-only in the core model).
async function initSubscription(
    subscriptions,
    notifyProcedure,
    apiurl,
    protocol
) {
    const dayjs = await getDayjs();
    const now = dayjs().utc();
    const defaultSubscription = {
            url: apiurl,
            protocol,
            ctUpdates: 0,
            ctErrors: 0,
            ctConsecutiveErrors: 0,
            whenCreated: new Date(now.format()),
            whenLastUpdate: null,
            whenLastError: null,
            whenExpires: new Date(
                now.add(ctSecsResourceExpire, 'seconds').format()
            ),
            ...(typeof notifyProcedure === 'string' ? { notifyProcedure } : {})
        },
        index = subscriptions.findIndex(subscription => {
            return subscription.url === apiurl;
        });

    if (-1 === index) {
        subscriptions.push(defaultSubscription);
    } else {
        subscriptions[index] = Object.assign(
            {},
            defaultSubscription,
            subscriptions[index]
        );
    }

    return subscriptions;
}

module.exports = initSubscription;
