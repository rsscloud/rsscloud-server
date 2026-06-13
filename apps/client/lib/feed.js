const { Builder } = require('xml2js');

// Render an RSS 2.0 feed carrying a <cloud> element — the document a publisher
// serves so a hub knows where to register for change notifications. Item
// pubDates are emitted in RFC 822 form.
function renderCloudFeed(opts) {
    return new Builder().buildObject({
        rss: {
            $: { version: '2.0' },
            channel: {
                title: opts.title,
                link: opts.link,
                description: opts.description,
                cloud: {
                    $: {
                        domain: opts.cloud.domain,
                        port: String(opts.cloud.port),
                        path: opts.cloud.path,
                        registerProcedure: opts.cloud.registerProcedure,
                        protocol: opts.cloud.protocol
                    }
                },
                item: opts.items.map(item => ({
                    title: item.title,
                    description: item.description,
                    pubDate: item.pubDate.toUTCString(),
                    guid: item.guid
                }))
            }
        }
    });
}

module.exports = { renderCloudFeed };
