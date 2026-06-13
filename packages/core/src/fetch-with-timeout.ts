/**
 * Run a fetch under a hard timeout: start an {@link AbortController}, abort it
 * after `ms`, and always clear the timer once the request settles. The single
 * home for the abort/clearTimeout dance every outbound caller (engine + each
 * protocol plugin) needs; they differ only in which `doFetch` and `ms` they pass.
 */
export async function fetchWithTimeout(
    doFetch: typeof fetch,
    ms: number,
    url: string,
    init: RequestInit
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
        return await doFetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}
