/** Metadata extracted from a feed body during change detection. */
export interface FeedMetadata {
    /** Feed flavour, e.g. `'rss'` or `'atom'`. */
    type?: 'rss' | 'atom' | (string & {});
    title?: string;
    description?: string;
    /** Human-facing site URL (RSS `link` / Atom alternate link). */
    htmlUrl?: string;
    language?: string;
}

/**
 * Port for turning a raw feed body into FeedMetadata. Core ships a default
 * implementation; hosts may inject their own.
 */
export interface FeedParser {
    /**
     * Resolves to `null` when the body is not a recognised/valid feed or
     * exceeds the configured size limit.
     */
    parse(body: string): Promise<FeedMetadata | null>;
}
