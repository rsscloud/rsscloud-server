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
let v2Path: string;
let v1Path: string;
let stores: FileStore[];

beforeEach(async () => {
    vi.useFakeTimers();
    stores = [];
    dir = await mkdtemp(join(tmpdir(), 'rsscloud-file-store-'));
    filePath = join(dir, 'subscriptions.json');
    v2Path = join(dir, 'subscriptions.v2.json');
    v1Path = join(dir, 'subscriptions.v1.json');
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
const SUBS_ONLY_FEED = 'https://subsonly.example/rss';

async function readV2(): Promise<unknown> {
    return JSON.parse(await readFile(v2Path, 'utf8'));
}

function v2Exists(): Promise<boolean> {
    return readFile(v2Path, 'utf8').then(
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

function coreResourceWithFeed(): Resource {
    return {
        ...coreResource(),
        feed: {
            type: 'rss',
            title: 'New',
            description: 'D',
            htmlUrl: 'http://x/',
            language: 'en'
        }
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

// ---- the legacy (pre-v2) on-disk shape used only on the import path ----

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

async function writeLegacyAt(path: string): Promise<void> {
    await writeFile(path, JSON.stringify(LEGACY_FILE, null, 2));
}

describe('createFileStore — v2 persistence', () => {
    it('writes the v2 envelope to subscriptions.v2.json', async () => {
        const store = await makeStore();

        await store.putResource(NEW_FEED, coreResourceWithFeed());
        await store.putSubscriptions(NEW_FEED, [coreSubscription()]);
        await store.flush();

        expect(await readV2()).toEqual({
            version: 2,
            feeds: {
                [NEW_FEED]: {
                    resource: {
                        url: NEW_FEED,
                        lastHash: 'abc',
                        lastSize: 100,
                        ctChecks: 5,
                        whenLastCheck: '2026-01-02T03:04:05.000Z',
                        ctUpdates: 2,
                        whenLastUpdate: '2026-01-02T03:04:05.000Z',
                        feed: {
                            type: 'rss',
                            title: 'New',
                            description: 'D',
                            htmlUrl: 'http://x/',
                            language: 'en'
                        }
                    },
                    subscriptions: [
                        {
                            url: 'http://sub.example/notify',
                            protocol: 'http-post',
                            ctUpdates: 0,
                            ctErrors: 0,
                            ctConsecutiveErrors: 0,
                            whenCreated: '2026-01-01T00:00:00.000Z',
                            whenLastUpdate: null,
                            whenLastError: null,
                            whenExpires: '2099-01-01T00:00:00.000Z'
                        }
                    ]
                }
            }
        });
    });

    it('persists a subscriptions-only feed with a null resource', async () => {
        const store = await makeStore();

        await store.putSubscriptions(SUBS_ONLY_FEED, [coreSubscription()]);
        await store.flush();

        const onDisk = (await readV2()) as {
            feeds: Record<string, { resource: unknown }>;
        };
        expect(onDisk.feeds[SUBS_ONLY_FEED]?.resource).toBeNull();
        expect(await store.getResource(SUBS_ONLY_FEED)).toBeNull();
    });

    it('round-trips the core model through put, close, and reload', async () => {
        const a = await makeStore();
        await a.putResource(NEW_FEED, coreResourceWithFeed());
        await a.putSubscriptions(NEW_FEED, [coreSubscription()]);
        await a.close();

        const b = await makeStore();

        // whenCreated is now persisted, so the subscription returns verbatim.
        expect(await b.getResource(NEW_FEED)).toEqual(coreResourceWithFeed());
        expect(await b.getSubscriptions(NEW_FEED)).toEqual([coreSubscription()]);
        expect(await b.list()).toEqual([
            {
                feedUrl: NEW_FEED,
                resource: coreResourceWithFeed(),
                subscriptions: [coreSubscription()]
            }
        ]);
    });

    it('loads a hand-written v2 file natively', async () => {
        await writeFile(
            v2Path,
            JSON.stringify({
                version: 2,
                feeds: {
                    [NEW_FEED]: {
                        resource: {
                            url: NEW_FEED,
                            lastHash: 'abc',
                            lastSize: 100,
                            ctChecks: 5,
                            whenLastCheck: '2026-01-02T03:04:05.000Z',
                            ctUpdates: 2,
                            whenLastUpdate: '2026-01-02T03:04:05.000Z',
                            feed: { type: 'rss', title: 'New' }
                        },
                        subscriptions: [
                            {
                                url: 'http://sub.example/notify',
                                protocol: 'http-post',
                                ctUpdates: 0,
                                ctErrors: 0,
                                ctConsecutiveErrors: 0,
                                whenCreated: '2026-01-01T00:00:00.000Z',
                                whenLastUpdate: null,
                                whenLastError: null,
                                whenExpires: '2099-01-01T00:00:00.000Z'
                            }
                        ]
                    },
                    [SUBS_ONLY_FEED]: { resource: null, subscriptions: [] }
                }
            })
        );

        const store = await makeStore();

        expect(await store.getResource(NEW_FEED)).toEqual({
            ...coreResource(),
            feed: { type: 'rss', title: 'New' }
        });
        expect(await store.getSubscriptions(NEW_FEED)).toEqual([
            coreSubscription()
        ]);
        expect(await store.getResource(SUBS_ONLY_FEED)).toBeNull();
    });

    it('removes a feed entirely', async () => {
        const store = await makeStore();
        await store.putResource(NEW_FEED, coreResource());
        await store.remove(NEW_FEED);

        expect(await store.getResource(NEW_FEED)).toBeNull();
        expect(await store.getSubscriptions(NEW_FEED)).toEqual([]);
        expect(await store.list()).toEqual([]);
    });

    it('starts empty when no file exists', async () => {
        const store = await makeStore();
        expect(await store.list()).toEqual([]);
    });

    it('starts empty when the v2 file is corrupt and there is no legacy file', async () => {
        await writeFile(v2Path, 'not json at all');

        const store = await makeStore();

        expect(await store.list()).toEqual([]);
    });
});

describe('createFileStore — legacy (v1) import', () => {
    it('imports the legacy bare-name file into core shape when no v2 exists', async () => {
        await writeLegacyAt(filePath);

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

    it('imports the legacy .v1.json file when present', async () => {
        await writeLegacyAt(v1Path);

        const store = await makeStore();

        expect((await store.list())[0]?.feedUrl).toBe(LEGACY_FEED);
    });

    it('migrates legacy data to v2 on first write, leaving the legacy file intact', async () => {
        await writeLegacyAt(filePath);
        const legacyBefore = await readFile(filePath, 'utf8');

        const store = await makeStore();
        await store.putResource(NEW_FEED, coreResource());
        await store.flush();

        // The legacy file is untouched; the new v2 file holds both feeds.
        expect(await readFile(filePath, 'utf8')).toBe(legacyBefore);
        const onDisk = (await readV2()) as { feeds: Record<string, unknown> };
        expect(Object.keys(onDisk.feeds).sort()).toEqual(
            [LEGACY_FEED, NEW_FEED].sort()
        );
    });

    it('lets v2 win when both a v2 and a legacy file exist', async () => {
        await writeLegacyAt(filePath);
        await writeFile(
            v2Path,
            JSON.stringify({
                version: 2,
                feeds: {
                    [NEW_FEED]: { resource: null, subscriptions: [] }
                }
            })
        );

        const store = await makeStore();

        expect((await store.list()).map(e => e.feedUrl)).toEqual([NEW_FEED]);
        expect(await store.getResource(LEGACY_FEED)).toBeNull();
    });

    it('calls onMigrate once after importing a legacy file', async () => {
        await writeLegacyAt(filePath);
        const onMigrate = vi.fn();

        await makeStore({ onMigrate });

        expect(onMigrate).toHaveBeenCalledTimes(1);
        expect(onMigrate).toHaveBeenCalledWith({
            from: filePath,
            to: v2Path,
            feedCount: 1
        });
    });

    it('does not call onMigrate when loading a v2 file', async () => {
        await writeFile(
            v2Path,
            JSON.stringify({ version: 2, feeds: {} })
        );
        const onMigrate = vi.fn();

        await makeStore({ onMigrate });

        expect(onMigrate).not.toHaveBeenCalled();
    });

    it('reads sparse, hand-written legacy entries with core defaults', async () => {
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
        expect(nosub?.resource).not.toBeNull();
    });

    it('treats a legacy entry with an empty resource as subscriptions-only', async () => {
        await writeFile(
            filePath,
            JSON.stringify({
                [SUBS_ONLY_FEED]: {
                    resource: {},
                    subscribers: []
                }
            })
        );

        const store = await makeStore();

        expect(await store.getResource(SUBS_ONLY_FEED)).toBeNull();
    });
});

describe('createFileStore — flush scheduling', () => {
    it('round-trips subscriptions through put and get in-memory', async () => {
        const store = await makeStore();

        await store.putSubscriptions(NEW_FEED, [coreSubscription()]);

        expect(await store.getSubscriptions(NEW_FEED)).toEqual([
            coreSubscription()
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
        const onDisk = (await readV2()) as { feeds: object };
        expect(Object.keys(onDisk.feeds)).toHaveLength(5);
    });

    it('flushes by maxWaitMs even when churn keeps re-arming the debounce', async () => {
        const store = await makeStore({ debounceMs: 1000, maxWaitMs: 3000 });

        await store.putResource(NEW_FEED, coreResource());

        // Churn every 900ms so the 1000ms debounce never settles on its own.
        for (let t = 900; t <= 2700; t += 900) {
            await vi.advanceTimersByTimeAsync(900);
            expect(await v2Exists()).toBe(false);
            await store.putResource(`${NEW_FEED}/${t}`, coreResource());
        }

        // At t=3000 the maxWait ceiling forces a flush a debounce-only
        // scheduler would have pushed out to t=3700.
        await vi.advanceTimersByTimeAsync(300);
        await store.flush();
        expect(await v2Exists()).toBe(true);
    });

    it('does not write until the debounce interval elapses', async () => {
        const store = await makeStore({ debounceMs: 1000 });

        await store.putResource(NEW_FEED, coreResource());

        await vi.advanceTimersByTimeAsync(999);
        expect(await v2Exists()).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        // The debounce timer has fired; join its write to settle it.
        await store.flush();
        expect(await v2Exists()).toBe(true);
        const onDisk = (await readV2()) as { feeds: object };
        expect(Object.keys(onDisk.feeds)).toEqual([NEW_FEED]);
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

        expect(await v2Exists()).toBe(false);
    });

    it('close performs a final flush and stops the timer', async () => {
        const store = await makeStore({ debounceMs: 1000 });

        await store.putResource(NEW_FEED, coreResource());
        expect(vi.getTimerCount()).toBe(1);

        await store.close();

        expect(await v2Exists()).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});
