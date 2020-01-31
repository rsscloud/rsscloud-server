const config = require('../config'),
    fs = require('fs'),
    mongodb = require('../services/mongodb');

async function doImport() {
    const db = await mongodb.connect('rsscloud', config.mongodbUri);

    if (fs.existsSync('./data/data.json')) {
        const data = JSON.parse(fs.readFileSync('./data/data.json', 'utf8'));

        await db.collection('resources').bulkWrite(
            Object.keys(data.resources).map(id => {
                return {
                    replaceOne: {
                        filter: { _id: id },
                        replacement: data.resources[id],
                        upsert: true
                    }
                };
            })
        );

        await db.collection('subscriptions').bulkWrite(
            Object.keys(data.subscriptions).map(id => {
                const subscriptions = {
                    _id: id,
                    pleaseNotify: Object.keys(data.subscriptions[id]).map(sid => {
                        const subscription = data.subscriptions[id][sid];
                        subscription.url = sid;
                        subscription.notifyProcedure = false;
                        subscription.protocol = 'http-post';
                        return subscription;
                    })
                }
                return {
                    replaceOne: {
                        filter: { _id: id },
                        replacement: subscriptions,
                        upsert: true
                    }
                };
            })
        );

        await mongodb.close('rsscloud');
    } else {
        await mongodb.close('rsscloud');

        throw new Error('Cannot find ./data/data.json');
    }
}

doImport()
    .then(() => {
        console.log('Imported ./data/data.json');
    })
    .catch(err => {
        console.error(err);
    });
