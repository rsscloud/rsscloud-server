import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStore } from './file-store.js';
import type { FileStore, FileStoreOptions } from './file-store.js';
import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';

let dir: string;
let filePath: string;
let stores: FileStore[];

beforeEach(async () => {
    vi.useFakeTimers();
    stores = [];
    dir = await mkdtemp(join(tmpdir(), 'rsscloud-file-store-'));
    filePath = join(dir, 'subscriptions.json');
});

afterEach(async () => {
    vi.useRealTimers();
    // Close every store so no background write is in flight during cleanup.
    for (const store of stores) await store.close();
    await rm(dir, { recursive: true, force: true });
});

/** Create a store and register it for guaranteed cleanup. */
async function makeStore(
    opts?: Partial<FileStoreOptions>
): Promise<FileStore> {
    const store = await createFileStore({ filePath, ...opts });
    stores.push(store);
    return store;
}

const LEGACY_FEED = 'http://scripting.com/rss.xml';
const NEW_FEED = 'https://feed.example/rss';

async function readDisk(): Promise<unknown> {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

function fileExists(): Promise<boolean> {
    return readFile(filePath, 'utf8').then(
        () => true,
        () => false
    );
}

function coreResource(): Resource {
    return {
        url: NEW_FEED,
        lastHash: 'abc',
        lastSize: 100,
        ctChecks: 5,
        whenLastCheck: new Date('2026-01-02T03:04:05.000Z'),
        ctUpdates: 2,
        whenLastUpdate: new Date('2026-01-02T03:04:05.000Z')
    };
}

function coreSubscription(): Subscription {
    return {
        url: 'http://sub.example/notify',
        protocol: 'http-post',
        ctUpdates: 0,
        ctErrors: 0,
        ctConsecutiveErrors: 0,
        whenCreated: new Date('2026-01-01T00:00:00.000Z'),
        whenLastUpdate: null,
        whenLastError: null,
        whenExpires: new Date('2099-01-01T00:00:00.000Z')
    };
}

const LEGACY_FILE = {
    [LEGACY_FEED]: {
        resource: {
            lastSize: 84682,
            lastHash: '0dbe7cdebe7669b47423a4f53cc67f68',
            ctChecks: 41426,
            whenLastCheck: '2026-06-10T12:55:28.000Z',
            ctUpdates: 35737,
            whenLastUpdate: '2026-06-10T12:45:25.000Z',
            feedType: 'rss',
            feedTitle: 'Scripting News',
            feedDescription: 'Dave Winer, OG blogger.',
            feedHtmlUrl: 'http://scripting.com/',
            feedLanguage: 'en-us'
        },
        subscribers: [
            {
                ctUpdates: 89560,
                whenLastUpdate: '2026-06-10T12:55:28.000Z',
                ctErrors: 122,
                ctConsecutiveErrors: 0,
                whenLastError: '2024-12-12T23:37:21.000Z',
                whenExpires: '2026-06-11T13:55:28+00:00',
                url: 'http://157.230.11.43:1414/feedping',
                notifyProcedure: false,
                protocol: 'http-post'
            }
        ]
    }
};

async function writeLegacy(): Promise<void> {
    await writeFile(filePath, JSON.stringify(LEGACY_FILE, null, 2));
}

describe('createFileStore', () => {
    it('loads a legacy file and exposes the resource in core shape', async () => {
        await writeLegacy();

        const store = await makeStore();

        expect(await store.getResource(LEGACY_FEED)).toEqual({
            url: LEGACY_FEED,
            lastHash: '0dbe7cdebe7669b47423a4f53cc67f68',
            lastSize: 84682,
            ctChecks: 41426,
            whenLastCheck: new Date('2026-06-10T12:55:28.000Z'),
            ctUpdates: 35737,
            whenLastUpdate: new Date('2026-06-10T12:45:25.000Z'),
            feed: {
                type: 'rss',
                title: 'Scripting News',
                description: 'Dave Winer, OG blogger.',
                htmlUrl: 'http://scripting.com/',
                language: 'en-us'
            }
        });
    });

    it('maps legacy subscribers to core subscriptions', async () => {
        await writeLegacy();

        const store = await makeStore();

        expect(await store.getSubscriptions(LEGACY_FEED)).toEqual([
            {
                url: 'http://157.230.11.43:1414/feedping',
                protocol: 'http-post',
                ctUpdates: 89560,
                ctErrors: 122,
                ctConsecutiveErrors: 0,
                whenCreated: new Date('2026-06-11T13:55:28+00:00'),
                whenLastUpdate: new Date('2026-06-10T12:55:28.000Z'),
                whenLastError: new Date('2024-12-12T23:37:21.000Z'),
                whenExpires: new Date('2026-06-11T13:55:28+00:00')
            }
        ]);
    });

    it('lists every tracked feed with its mapped resource and subscriptions', async () => {
        await writeLegacy();

        const store = await makeStore();

        expect(await store.list()).toEqual([
            {
                feedUrl: LEGACY_FEED,
                resource: await store.getResource(LEGACY_FEED),
                subscriptions: await store.getSubscriptions(LEGACY_FEED)
            }
        ]);
    });

    it('removes a feed entirely', async () => {
        await writeLegacy();

        const store = await makeStore();
        await store.remove(LEGACY_FEED);

        expect(await store.getResource(LEGACY_FEED)).toBeNull();
        expect(await store.getSubscriptions(LEGACY_FEED)).toEqual([]);
        expect(await store.list()).toEqual([]);
    });

    it('flushes putResource as a faithful flat resource shape', async () => {
        const store = await makeStore();

        await store.putResource(NEW_FEED, {
            url: NEW_FEED,
            lastHash: 'abc',
            lastSize: 100,
            ctChecks: 5,
            whenLastCheck: new Date('2026-01-02T03:04:05.000Z'),
            ctUpdates: 2,
            whenLastUpdate: new Date('2026-01-02T03:04:05.000Z'),
            feed: {
                type: 'rss',
                title: 'New',
                description: 'D',
                htmlUrl: 'http://x/',
                language: 'en'
            }
        });
        await store.flush();

        expect(await readDisk()).toEqual({
            [NEW_FEED]: {
                resource: {
                    lastSize: 100,
                    lastHash: 'abc',
                    ctChecks: 5,
                    whenLastCheck: '2026-01-02T03:04:05.000Z',
                    ctUpdates: 2,
                    whenLastUpdate: '2026-01-02T03:04:05.000Z',
                    feedType: 'rss',
                    feedTitle: 'New',
                    feedDescription: 'D',
                    feedHtmlUrl: 'http://x/',
                    feedLanguage: 'en'
                },
                subscribers: []
            }
        });
    });

    it('flushes putSubscriptions as faithful subscriber records', async () => {
        const store = await makeStore();

        await store.putSubscriptions(NEW_FEED, [
            {
                url: 'http://sub.example/notify',
                protocol: 'http-post',
                ctUpdates: 0,
                ctErrors: 0,
                ctConsecutiveErrors: 0,
                whenCreated: new Date('2026-01-01T00:00:00.000Z'),
                whenLastUpdate: null,
                whenLastError: null,
                whenExpires: new Date('2099-01-01T00:00:00.000Z')
            },
            {
                url: 'http://sub.example/rpc',
                protocol: 'xml-rpc',
                notifyProcedure: 'river.feedUpdated',
                ctUpdates: 3,
                ctErrors: 1,
                ctConsecutiveErrors: 0,
                whenCreated: new Date('2026-01-01T00:00:00.000Z'),
                whenLastUpdate: new Date('2026-02-01T00:00:00.000Z'),
                whenLastError: new Date('2025-12-01T00:00:00.000Z'),
                whenExpires: new Date('2099-01-01T00:00:00.000Z'),
                details: { secret: 's3cr3t' }
            }
        ]);
        await store.flush();

        expect(await readDisk()).toEqual({
            [NEW_FEED]: {
                resource: {},
                subscribers: [
                    {
                        ctUpdates: 0,
                        whenLastUpdate: '1970-01-01T00:00:00.000Z',
                        ctErrors: 0,
                        ctConsecutiveErrors: 0,
                        whenLastError: '1970-01-01T00:00:00.000Z',
                        whenExpires: '2099-01-01T00:00:00.000Z',
                        url: 'http://sub.example/notify',
                        notifyProcedure: false,
                        protocol: 'http-post'
                    },
                    {
                        ctUpdates: 3,
                        whenLastUpdate: '2026-02-01T00:00:00.000Z',
                        ctErrors: 1,
                        ctConsecutiveErrors: 0,
                        whenLastError: '2025-12-01T00:00:00.000Z',
                        whenExpires: '2099-01-01T00:00:00.000Z',
                        url: 'http://sub.example/rpc',
                        notifyProcedure: 'river.feedUpdated',
                        protocol: 'xml-rpc',
                        details: { secret: 's3cr3t' }
                    }
                ]
            }
        });

        // An entry created via subscriptions only has no real resource.
        expect(await store.getResource(NEW_FEED)).toBeNull();
    });

    it('round-trips subscriptions through put and get', async () => {
        const store = await makeStore();

        await store.putSubscriptions(NEW_FEED, [coreSubscription()]);

        // whenCreated is not persisted; it is re-derived from whenExpires.
        expect(await store.getSubscriptions(NEW_FEED)).toEqual([
            {
                ...coreSubscription(),
                whenCreated: new Date('2099-01-01T00:00:00.000Z')
            }
        ]);
    });

    it('coalesces a burst of puts into a single scheduled flush', async () => {
        const store = await makeStore({ debounceMs: 1000 });

        for (let i = 0; i < 5; i += 1) {
            await store.putResource(`${NEW_FEED}/${i}`, coreResource());
        }
        // Each put re-arms one timer rather than queuing five.
        expect(vi.getTimerCount()).toBe(1);

        await vi.advanceTimersByTimeAsync(1000);
        await store.flush();

        // The single flush captured every feed from the burst.
        expect(Object.keys((await readDisk()) as object)).toHaveLength(5);
    });

    it('flushes by maxWaitMs even when churn keeps re-arming the debounce', async () => {
        const store = await makeStore({ debounceMs: 1000, maxWaitMs: 3000 });

        await store.putResource(NEW_FEED, coreResource());

        // Churn every 900ms so the 1000ms debounce never settles on its own.
        for (let t = 900; t <= 2700; t += 900) {
            await vi.advanceTimersByTimeAsync(900);
            expect(await fileExists()).toBe(false);
            await store.putResource(`${NEW_FEED}/${t}`, coreResource());
        }

        // At t=3000 the maxWait ceiling forces a flush a debounce-only
        // scheduler would have pushed out to t=3700.
        await vi.advanceTimersByTimeAsync(300);
        await store.flush();
        expect(await fileExists()).toBe(true);
    });

    it('does not write until the debounce interval elapses', async () => {
        const store = await makeStore({ debounceMs: 1000 });

        await store.putResource(NEW_FEED, coreResource());

        await vi.advanceTimersByTimeAsync(999);
        expect(await fileExists()).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        // The debounce timer has fired; join its write to settle it.
        await store.flush();
        expect(await fileExists()).toBe(true);
        expect(Object.keys((await readDisk()) as object)).toEqual([NEW_FEED]);
    });

    it('keeps resource and subscriptions together for one feed', async () => {
        const store = await makeStore();

        await store.putResource(NEW_FEED, coreResource());
        await store.putSubscriptions(NEW_FEED, [coreSubscription()]);
        await store.flush();

        const onDisk = (await readDisk()) as Record<
            string,
            { resource: unknown; subscribers: unknown[] }
        >;
        expect(onDisk[NEW_FEED]?.resource).not.toEqual({});
        expect(onDisk[NEW_FEED]?.subscribers).toHaveLength(1);
    });

    it('reads sparse, hand-written entries with core defaults', async () => {
        const SPARSE_FEED = 'https://sparse.example/feed';
        const NOSUB_FEED = 'https://nosub.example/feed';
        await writeFile(
            filePath,
            JSON.stringify({
                [SPARSE_FEED]: {
                    // Only one change field present, no feed metadata.
                    resource: { lastHash: 'x' },
                    subscribers: [
                        {
                            url: 'https://sub.example/rpc',
                            protocol: 'xml-rpc',
                            notifyProcedure: 'river.feedUpdated',
                            whenCreated: '2020-01-01T00:00:00.000Z',
                            details: { secret: 'x' }
                            // counters, whenLastUpdate/Error, whenExpires absent
                        }
                    ]
                },
                // An entry with a resource but no subscribers key at all.
                [NOSUB_FEED]: { resource: { lastSize: 1 } }
            })
        );

        const store = await makeStore();

        expect(await store.getResource(SPARSE_FEED)).toEqual({
            url: SPARSE_FEED,
            lastHash: 'x',
            lastSize: 0,
            ctChecks: 0,
            whenLastCheck: new Date(0),
            ctUpdates: 0,
            whenLastUpdate: new Date(0)
        });

        expect(await store.getSubscriptions(SPARSE_FEED)).toEqual([
            {
                url: 'https://sub.example/rpc',
                protocol: 'xml-rpc',
                notifyProcedure: 'river.feedUpdated',
                ctUpdates: 0,
                ctErrors: 0,
                ctConsecutiveErrors: 0,
                whenCreated: new Date('2020-01-01T00:00:00.000Z'),
                whenLastUpdate: null,
                whenLastError: null,
                whenExpires: new Date(0),
                details: { secret: 'x' }
            }
        ]);

        // A resource-only entry lists with no subscriptions.
        expect(await store.getSubscriptions(NOSUB_FEED)).toEqual([]);
        const nosub = (await store.list()).find(e => e.feedUrl === NOSUB_FEED);
        expect(nosub?.subscriptions).toEqual([]);
    });

    it('starts empty when the file is corrupt', async () => {
        await writeFile(filePath, 'not json at all');

        const store = await makeStore();

        expect(await store.list()).toEqual([]);
    });

    it('keeps data in memory when a write fails, without throwing', async () => {
        // A file where a directory is expected makes the atomic write fail.
        await writeFile(join(dir, 'blocker'), 'x');
        const store = await makeStore({
            filePath: join(dir, 'blocker', 'subscriptions.json')
        });

        await store.putResource(NEW_FEED, coreResource());
        await expect(store.flush()).resolves.toBeUndefined();

        // The change is retained in memory (and re-armed for a later retry).
        expect(await store.getResource(NEW_FEED)).not.toBeNull();
    });

    it('flush is a no-op when nothing has changed', async () => {
        const store = await makeStore();

        await store.flush();

        expect(await fileExists()).toBe(false);
    });

    it('close performs a final flush and stops the timer', async () => {
        const store = await makeStore({ debounceMs: 1000 });

        await store.putResource(NEW_FEED, coreResource());
        expect(vi.getTimerCount()).toBe(1);

        await store.close();

        expect(await fileExists()).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});
