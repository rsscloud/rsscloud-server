import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FeedMetadata } from '../feed/feed.js';
import type { Protocol } from '../engine/protocol.js';
import type { Resource } from '../engine/resource.js';
import type { Subscription } from '../engine/subscription.js';
import type { FeedEntry, Store } from './store.js';

/** Options for {@link createFileStore}. */
export interface FileStoreOptions {
    /** Path to the JSON file the store loads from and flushes to. */
    filePath: string;
    /** Quiet-gap delay before a coalesced flush. Defaults to 1000ms. */
    debounceMs?: number;
    /** Hard ceiling between flushes under sustained churn. Defaults to 60000ms. */
    maxWaitMs?: number;
}

/** A file-backed {@link Store} with durable-flush controls. */
export interface FileStore extends Store {
    /** Force a durable write of the current state; resolves once on disk. */
    flush(): Promise<void>;
    /** Stop the flush timer and perform a final durable write. */
    close(): Promise<void>;
}

/** One feed's on-disk record: flat resource fields plus its subscribers. */
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

const EPOCH_ISO = new Date(0).toISOString();

/** Epoch (`new Date(0)`) marks "never happened" on disk. */
function readWhen(value: string | undefined): Date {
    return new Date(value ?? 0);
}

/** Epoch on disk maps to `null` ("never") in the core model. */
function readNullableWhen(value: string | undefined): Date | null {
    const date = new Date(value ?? 0);
    return date.getTime() === 0 ? null : date;
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

function writeResource(resource: Resource): DiskResource {
    const out: DiskResource = {
        lastSize: resource.lastSize,
        lastHash: resource.lastHash,
        ctChecks: resource.ctChecks,
        whenLastCheck: resource.whenLastCheck.toISOString(),
        ctUpdates: resource.ctUpdates,
        whenLastUpdate: resource.whenLastUpdate.toISOString()
    };
    const feed = resource.feed;
    if (feed !== undefined) {
        if (feed.type != null) out.feedType = feed.type;
        if (feed.title != null) out.feedTitle = feed.title;
        if (feed.description != null) out.feedDescription = feed.description;
        if (feed.htmlUrl != null) out.feedHtmlUrl = feed.htmlUrl;
        if (feed.language != null) out.feedLanguage = feed.language;
    }
    return out;
}

/** `null` ("never") serializes back to the epoch string the legacy reader uses. */
function writeWhen(value: Date | null): string {
    return value === null ? EPOCH_ISO : value.toISOString();
}

function writeSubscription(subscription: Subscription): DiskSubscriber {
    const out: DiskSubscriber = {
        ctUpdates: subscription.ctUpdates,
        whenLastUpdate: writeWhen(subscription.whenLastUpdate),
        ctErrors: subscription.ctErrors,
        ctConsecutiveErrors: subscription.ctConsecutiveErrors,
        whenLastError: writeWhen(subscription.whenLastError),
        whenExpires: subscription.whenExpires.toISOString(),
        url: subscription.url,
        // REST subs carry no procedure; the legacy shape records that as `false`.
        notifyProcedure: subscription.notifyProcedure ?? false,
        protocol: subscription.protocol
    };
    if (subscription.details !== undefined) {
        out.details = subscription.details;
    }
    return out;
}

async function loadDisk(filePath: string): Promise<DiskData> {
    try {
        return JSON.parse(await readFile(filePath, 'utf8')) as DiskData;
    } catch {
        return {};
    }
}

/**
 * A file-backed {@link Store}. Loads on init, maps the legacy on-disk shape
 * (keyed by feed URL, flat feed fields, string dates) to and from core's model.
 */
export async function createFileStore(
    options: FileStoreOptions
): Promise<FileStore> {
    const { filePath } = options;
    const debounceMs = options.debounceMs ?? 1000;
    const maxWaitMs = options.maxWaitMs ?? 60000;
    const disk = await loadDisk(filePath);

    let dirty = false;
    let firstDirtyAt: number | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;

    function entryFor(feedUrl: string): DiskEntry {
        const existing = disk[feedUrl];
        if (existing !== undefined) return existing;
        // Mirror the legacy shape: every entry has a resource and subscribers.
        const created: DiskEntry = { resource: {}, subscribers: [] };
        disk[feedUrl] = created;
        return created;
    }

    async function writeToDisk(): Promise<void> {
        await mkdir(dirname(filePath), { recursive: true });
        // Snapshot synchronously so an in-flight write can't tear.
        const snapshot = JSON.stringify(disk, null, 2);
        const tmp = `${filePath}.tmp`;
        await writeFile(tmp, snapshot);
        await rename(tmp, filePath);
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
            return readResource(feedUrl, disk[feedUrl]?.resource);
        },

        async putResource(
            feedUrl: string,
            resource: Resource
        ): Promise<void> {
            entryFor(feedUrl).resource = writeResource(resource);
            markDirty();
        },

        async getSubscriptions(feedUrl: string): Promise<Subscription[]> {
            const subscribers = disk[feedUrl]?.subscribers ?? [];
            return subscribers.map(readSubscription);
        },

        async putSubscriptions(
            feedUrl: string,
            subscriptions: Subscription[]
        ): Promise<void> {
            entryFor(feedUrl).subscribers = subscriptions.map(writeSubscription);
            markDirty();
        },

        async list(): Promise<FeedEntry[]> {
            return Object.entries(disk).map(([feedUrl, entry]) => ({
                feedUrl,
                resource: readResource(feedUrl, entry.resource),
                subscriptions: (entry.subscribers ?? []).map(readSubscription)
            }));
        },

        async remove(feedUrl: string): Promise<void> {
            delete disk[feedUrl];
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
