import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FeedMetadata } from '../feed/feed.js';
import type { Protocol } from '../engine/protocol.js';
import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';
import type { FeedEntry, Store } from './store.js';
import {
    resourceFromJson,
    resourceToJson,
    subscriptionFromJson,
    subscriptionToJson,
    type JsonResource,
    type JsonSubscription
} from './store-codec.js';

/** Reported once when a pre-v2 (legacy) file is imported, for host logging. */
export interface MigrationInfo {
    /** The legacy file the data was imported from. */
    from: string;
    /** The v2 file all future writes target. */
    to: string;
    /** Number of feeds imported. */
    feedCount: number;
}

/** Options for {@link createFileStore}. */
export interface FileStoreOptions {
    /**
     * Path to the legacy/bare data file. The v2 file written and preferred on
     * load is the sibling `.v2.json`; a `.v1.json` legacy file is also
     * honoured on import. Defaults derive from this single path.
     */
    filePath: string;
    /** Quiet-gap delay before a coalesced flush. Defaults to 1000ms. */
    debounceMs?: number;
    /** Hard ceiling between flushes under sustained churn. Defaults to 60000ms. */
    maxWaitMs?: number;
    /** Invoked once after a legacy file is imported (no-op if absent). */
    onMigrate?: (info: MigrationInfo) => void;
}

/** A file-backed {@link Store} with durable-flush controls. */
export interface FileStore extends Store {
    /** Force a durable write of the current state; resolves once on disk. */
    flush(): Promise<void>;
    /** Stop the flush timer and perform a final durable write. */
    close(): Promise<void>;
}

/** One feed in memory: the core model directly (no per-call mapping). */
interface Entry {
    resource: Resource | null;
    subscriptions: Subscription[];
}

// ---- v2 on-disk envelope ----

interface V2Entry {
    resource: JsonResource | null;
    subscriptions: JsonSubscription[];
}

interface V2Doc {
    version: 2;
    feeds: Record<string, V2Entry>;
}

function isV2(doc: unknown): doc is V2Doc {
    return (doc as { version?: unknown } | null | undefined)?.version === 2;
}

// ---- legacy (pre-v2) on-disk shape + one-way importer ----

interface DiskResource {
    lastSize?: number;
    lastHash?: string;
    ctChecks?: number;
    whenLastCheck?: string;
    ctUpdates?: number;
    whenLastUpdate?: string;
    feedType?: string;
    feedTitle?: string;
    feedDescription?: string;
    feedHtmlUrl?: string;
    feedLanguage?: string;
}

interface DiskSubscriber {
    url: string;
    protocol: Protocol;
    notifyProcedure?: string | false;
    ctUpdates?: number;
    ctErrors?: number;
    ctConsecutiveErrors?: number;
    whenCreated?: string;
    whenLastUpdate?: string;
    whenLastError?: string;
    whenExpires?: string;
    details?: Record<string, unknown>;
}

interface DiskEntry {
    resource?: DiskResource | null;
    subscribers?: DiskSubscriber[];
}

type DiskData = Record<string, DiskEntry>;

/** Epoch (`new Date(0)`) marks "never happened" in the legacy file. */
function readWhen(value: string | undefined): Date {
    return new Date(value ?? 0);
}

/** Epoch in the legacy file maps to `null` ("never") in the core model. */
function readNullableWhen(value: string | undefined): Date | null {
    const date = new Date(value ?? 0);
    return date.getTime() === 0 ? null : date;
}

function readFeed(raw: DiskResource): FeedMetadata | undefined {
    const feed: FeedMetadata = {};
    if (raw.feedType != null) feed.type = raw.feedType;
    if (raw.feedTitle != null) feed.title = raw.feedTitle;
    if (raw.feedDescription != null) feed.description = raw.feedDescription;
    if (raw.feedHtmlUrl != null) feed.htmlUrl = raw.feedHtmlUrl;
    if (raw.feedLanguage != null) feed.language = raw.feedLanguage;
    return Object.keys(feed).length > 0 ? feed : undefined;
}

function readResource(
    feedUrl: string,
    raw: DiskResource | null | undefined
): Resource | null {
    // A missing or `{}` resource (a subscriptions-only entry) is "no resource".
    if (raw == null || Object.keys(raw).length === 0) return null;
    const resource: Resource = {
        url: feedUrl,
        lastHash: raw.lastHash ?? '',
        lastSize: raw.lastSize ?? 0,
        ctChecks: raw.ctChecks ?? 0,
        whenLastCheck: new Date(raw.whenLastCheck ?? 0),
        ctUpdates: raw.ctUpdates ?? 0,
        whenLastUpdate: new Date(raw.whenLastUpdate ?? 0)
    };
    const feed = readFeed(raw);
    if (feed !== undefined) resource.feed = feed;
    return resource;
}

function readSubscription(raw: DiskSubscriber): Subscription {
    const whenExpires = readWhen(raw.whenExpires);
    const subscription: Subscription = {
        url: raw.url,
        protocol: raw.protocol,
        ctUpdates: raw.ctUpdates ?? 0,
        ctErrors: raw.ctErrors ?? 0,
        ctConsecutiveErrors: raw.ctConsecutiveErrors ?? 0,
        // Legacy records carry no creation time; synthesize from expiry.
        whenCreated: raw.whenCreated != null ? readWhen(raw.whenCreated) : whenExpires,
        whenLastUpdate: readNullableWhen(raw.whenLastUpdate),
        whenLastError: readNullableWhen(raw.whenLastError),
        whenExpires
    };
    if (typeof raw.notifyProcedure === 'string') {
        subscription.notifyProcedure = raw.notifyProcedure;
    }
    if (raw.details !== undefined) {
        subscription.details = raw.details;
    }
    return subscription;
}

function importLegacy(data: DiskData): Map<string, Entry> {
    const feeds = new Map<string, Entry>();
    for (const [feedUrl, entry] of Object.entries(data)) {
        feeds.set(feedUrl, {
            resource: readResource(feedUrl, entry.resource),
            subscriptions: (entry.subscribers ?? []).map(readSubscription)
        });
    }
    return feeds;
}

function loadV2(doc: V2Doc): Map<string, Entry> {
    const feeds = new Map<string, Entry>();
    for (const [feedUrl, entry] of Object.entries(doc.feeds)) {
        feeds.set(feedUrl, {
            resource:
                entry.resource === null
                    ? null
                    : resourceFromJson(entry.resource),
            subscriptions: entry.subscriptions.map(subscriptionFromJson)
        });
    }
    return feeds;
}

// ---- path derivation + raw reads ----

function derivePaths(filePath: string): {
    v2Path: string;
    v1Path: string;
    legacyPath: string;
} {
    const base = filePath.replace(/\.json$/, '');
    return {
        v2Path: `${base}.v2.json`,
        v1Path: `${base}.v1.json`,
        legacyPath: filePath
    };
}

async function readJson(path: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
        return undefined;
    }
}

interface LoadResult {
    feeds: Map<string, Entry>;
    migratedFrom: string | null;
}

/**
 * Load with v2 precedence: the `.v2.json` file if present, else a converted
 * legacy file (`.v1.json` then the bare name), else empty. The legacy file is
 * read-only on this path — writes always target v2.
 */
async function load(paths: ReturnType<typeof derivePaths>): Promise<LoadResult> {
    const v2 = await readJson(paths.v2Path);
    if (isV2(v2)) {
        return { feeds: loadV2(v2), migratedFrom: null };
    }

    const fromV1 = await readJson(paths.v1Path);
    if (fromV1 !== undefined) {
        return { feeds: importLegacy(fromV1 as DiskData), migratedFrom: paths.v1Path };
    }

    const fromLegacy = await readJson(paths.legacyPath);
    if (fromLegacy !== undefined) {
        return {
            feeds: importLegacy(fromLegacy as DiskData),
            migratedFrom: paths.legacyPath
        };
    }

    return { feeds: new Map(), migratedFrom: null };
}

/**
 * A file-backed {@link Store}. Holds the core model in memory and persists it
 * as the versioned v2 envelope; a pre-v2 file is imported (one-way) on first
 * boot, then left untouched as a backup while writes move to `.v2.json`.
 */
export async function createFileStore(
    options: FileStoreOptions
): Promise<FileStore> {
    const debounceMs = options.debounceMs ?? 1000;
    const maxWaitMs = options.maxWaitMs ?? 60000;
    const paths = derivePaths(options.filePath);

    const { feeds, migratedFrom } = await load(paths);
    if (migratedFrom !== null) {
        options.onMigrate?.({
            from: migratedFrom,
            to: paths.v2Path,
            feedCount: feeds.size
        });
    }

    let dirty = false;
    let firstDirtyAt: number | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;

    function entryFor(feedUrl: string): Entry {
        const existing = feeds.get(feedUrl);
        if (existing !== undefined) return existing;
        const created: Entry = { resource: null, subscriptions: [] };
        feeds.set(feedUrl, created);
        return created;
    }

    function snapshot(): string {
        const doc: V2Doc = { version: 2, feeds: {} };
        for (const [feedUrl, entry] of feeds) {
            doc.feeds[feedUrl] = {
                resource:
                    entry.resource === null
                        ? null
                        : resourceToJson(entry.resource),
                subscriptions: entry.subscriptions.map(subscriptionToJson)
            };
        }
        return JSON.stringify(doc, null, 2);
    }

    async function writeToDisk(): Promise<void> {
        await mkdir(dirname(paths.v2Path), { recursive: true });
        // Snapshot synchronously so an in-flight write can't tear.
        const data = snapshot();
        const tmp = `${paths.v2Path}.tmp`;
        await writeFile(tmp, data);
        await rename(tmp, paths.v2Path);
    }

    function clearFlushTimer(): void {
        if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
    }

    /**
     * Write the current state durably. Joins an in-flight write rather than
     * starting a second one; coalesces any mutations that land mid-write into a
     * follow-up pass; resolves once the disk reflects everything seen. A failed
     * write is best-effort — the data stays in memory and is retried on the next
     * mutation or flush rather than thrown.
     */
    function doFlush(): Promise<void> {
        if (inFlight !== null) return inFlight;
        if (!dirty) return Promise.resolve();
        clearFlushTimer();
        inFlight = (async () => {
            try {
                while (dirty) {
                    dirty = false;
                    firstDirtyAt = null;
                    await writeToDisk();
                }
            } catch {
                dirty = true;
            } finally {
                inFlight = null;
                clearFlushTimer();
            }
        })();
        return inFlight;
    }

    function markDirty(): void {
        dirty = true;
        const startedAt = firstDirtyAt ?? Date.now();
        firstDirtyAt = startedAt;
        clearFlushTimer();
        // Debounce, but never push the next write past the maxWait ceiling
        // measured from when the run of changes began. A negative wait (already
        // past the ceiling) lets setTimeout fire on the next tick.
        const wait = Math.min(debounceMs, maxWaitMs - (Date.now() - startedAt));
        flushTimer = setTimeout(() => void doFlush(), wait);
    }

    return {
        async getResource(feedUrl: string): Promise<Resource | null> {
            return feeds.get(feedUrl)?.resource ?? null;
        },

        async putResource(feedUrl: string, resource: Resource): Promise<void> {
            entryFor(feedUrl).resource = resource;
            markDirty();
        },

        async getSubscriptions(feedUrl: string): Promise<Subscription[]> {
            return feeds.get(feedUrl)?.subscriptions ?? [];
        },

        async putSubscriptions(
            feedUrl: string,
            subscriptions: Subscription[]
        ): Promise<void> {
            entryFor(feedUrl).subscriptions = subscriptions;
            markDirty();
        },

        async list(): Promise<FeedEntry[]> {
            return Array.from(feeds, ([feedUrl, entry]) => ({
                feedUrl,
                resource: entry.resource,
                subscriptions: entry.subscriptions
            }));
        },

        async remove(feedUrl: string): Promise<void> {
            feeds.delete(feedUrl);
            markDirty();
        },

        async flush(): Promise<void> {
            await doFlush();
        },

        async close(): Promise<void> {
            clearFlushTimer();
            await doFlush();
        }
    };
}
