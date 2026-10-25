import "server-only";

// SerpApi helpers. The key stays on the server. Results are cached in memory for
// 10 minutes per query to save credits.

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();

export function isSerpConfigured() {
  return Boolean(process.env.SERPAPI_KEY);
}

export async function serpSearch<T = Record<string, unknown>>(params: Record<string, string>): Promise<T> {
  const key = JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;

  const url = new URL("https://serpapi.com/search.json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", process.env.SERPAPI_KEY!);

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** "Houston, TX" -> "Houston, Texas, United States" for SerpApi's location param. */
export function serpLocation(city: string) {
  const states: Record<string, string> = { TX: "Texas", FL: "Florida", AZ: "Arizona", NY: "New York", CA: "California", IL: "Illinois" };
  const [name, st] = city.split(",").map((s) => s.trim());
  const state = st ? states[st.toUpperCase()] ?? st : "";
  return [name, state, "United States"].filter(Boolean).join(",");
}
