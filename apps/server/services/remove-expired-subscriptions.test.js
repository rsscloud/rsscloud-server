const test = require('node:test');
const assert = require('node:assert/strict');

const jsonStore = require('./json-store');
const removeExpiredSubscriptions = require('./remove-expired-subscriptions');

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();

const expired = () => iso(-DAY_MS);
const active = () => iso(DAY_MS);
const withinWindow = () => iso(-DAY_MS);
const beyondWindow = () => iso(-10 * DAY_MS);

function subscription(overrides = {}) {
    return {
        url: 'http://sub.example.com/notify',
        protocol: 'http-post',
        whenExpires: active(),
        ctConsecutiveErrors: 0,
        ...overrides
    };
}

test.beforeEach(() => {
    jsonStore.clear();
});

test('removes an expired subscription and prunes the now-empty feed', async() => {
    const feed = 'https://a.example.com/feed.xml';
    jsonStore.setSubscriptions(feed, [
        subscription({ whenExpires: expired() })
    ]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 1);
    assert.ok(!Object.prototype.hasOwnProperty.call(jsonStore.getData(), feed));
});

test('clears an expired subscription but retains a recently-updated feed', async() => {
    const feed = 'https://b.example.com/feed.xml';
    jsonStore.setResource(feed, {
        feedTitle: 'Bravo',
        whenLastUpdate: withinWindow()
    });
    jsonStore.setSubscriptions(feed, [
        subscription({ whenExpires: expired() })
    ]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 1);
    const data = jsonStore.getData();
    assert.ok(Object.prototype.hasOwnProperty.call(data, feed));
    assert.deepEqual(data[feed].subscribers, []);
});

test('removes a feed whose resource is older than the retention window', async() => {
    const feed = 'https://c.example.com/feed.xml';
    jsonStore.setResource(feed, {
        feedTitle: 'Charlie',
        whenLastUpdate: beyondWindow()
    });
    jsonStore.setSubscriptions(feed, [
        subscription({ whenExpires: expired() })
    ]);

    await removeExpiredSubscriptions();

    assert.ok(!Object.prototype.hasOwnProperty.call(jsonStore.getData(), feed));
});

test('leaves active subscriptions untouched', async() => {
    const feed = 'https://d.example.com/feed.xml';
    jsonStore.setResource(feed, {
        feedTitle: 'Delta',
        whenLastUpdate: withinWindow()
    });
    jsonStore.setSubscriptions(feed, [subscription({ whenExpires: active() })]);

    const result = await removeExpiredSubscriptions();

    assert.equal(result.subscriptionsRemoved, 0);
    const data = jsonStore.getData();
    assert.ok(Object.prototype.hasOwnProperty.call(data, feed));
    assert.equal(data[feed].subscribers.length, 1);
});

test('removes an orphaned resource with no subscriptions', async() => {
    const feed = 'https://e.example.com/feed.xml';
    jsonStore.setResource(feed, {
        feedTitle: 'Echo',
        whenLastUpdate: beyondWindow()
    });

    await removeExpiredSubscriptions();

    assert.ok(!Object.prototype.hasOwnProperty.call(jsonStore.getData(), feed));
});
