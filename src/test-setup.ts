/**
 * Unit tests never reach a real CampusOne Card Reader: a helper running on the developer's computer
 * (http://127.0.0.1:47821) would otherwise switch the card pages to the reader version.
 * Tests of the reader stub `fetch` themselves.
 */
const realFetch = globalThis.fetch?.bind(globalThis);
if (realFetch) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('http://127.0.0.1:47821')) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
