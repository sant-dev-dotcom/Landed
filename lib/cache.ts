import "server-only";
import Redis from "ioredis";

// Shared cache for work that is slow and costs Gemini calls to redo: app translations and
// AI-formatted pages. With VALKEY_URL set (Vultr Managed Valkey, or any Redis), entries are
// shared by every server and survive restarts and deploys. Without it, each namespace falls
// back to a small in-memory cache, as before.
//
// The cache never holds anyone's own data, only results that can be rebuilt. So if Valkey is
// slow or down, a read is a miss and a write is skipped: the app does the work itself.

const PREFIX = "landed:";

// One connection per process, kept on globalThis: `next dev` re-runs this module on every
// hot reload, and each new client would otherwise leave its old connection open.
const shared = globalThis as typeof globalThis & { landedValkey?: Redis | null };
let lastError = 0;

function valkey(): Redis | null {
  if (shared.landedValkey !== undefined) return shared.landedValkey;
  const url = process.env.VALKEY_URL;
  if (!url) return (shared.landedValkey = null);
  const client = (shared.landedValkey = new Redis(url, {
    // Fail fast instead of queueing while disconnected: a miss is better than a stalled page.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    commandTimeout: 1_000,
  }));
  client.on("error", (err) => {
    // Reconnects on its own; log at most once a minute.
    if (Date.now() - lastError < 60_000) return;
    lastError = Date.now();
    console.warn("[cache] Valkey unavailable:", err.message);
  });
  return client;
}

/**
 * The client once it can take commands. Right after a start the connection is still opening,
 * and with the offline queue off a command then fails at once: wait for it (up to 2s) rather
 * than miss. While reconnecting after an outage, don't wait.
 */
async function connected(): Promise<Redis | null> {
  const client = valkey();
  if (!client || client.status === "ready") return client;
  if (client.status !== "connecting" && client.status !== "connect" && client.status !== "wait") return null;
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      client.off("ready", onReady);
      client.off("close", onClose);
      resolve(ok ? client : null);
    };
    const onReady = () => done(true);
    const onClose = () => done(false); // refused or dropped: don't wait out the timer
    const timer = setTimeout(() => done(false), 2_000);
    client.once("ready", onReady);
    client.once("close", onClose);
  });
}

export interface Cache<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
}

/**
 * A cache namespace. `memoryMax` caps entries in the in-memory fallback only; in Valkey,
 * old entries are evicted by the server's policy (use allkeys-lru).
 */
export function createCache<T>(namespace: string, { ttlSeconds, memoryMax }: { ttlSeconds: number; memoryMax: number }): Cache<T> {
  const memory = new Map<string, { until: number; value: T }>();
  const full = (key: string) => `${PREFIX}${namespace}:${key}`;

  return {
    async get(key) {
      if (valkey()) {
        const redis = await connected();
        if (!redis) return undefined;
        try {
          const raw = await redis.get(full(key));
          return raw === null ? undefined : (JSON.parse(raw) as T);
        } catch {
          return undefined;
        }
      }
      const hit = memory.get(key);
      if (!hit) return undefined;
      if (hit.until > Date.now()) return hit.value;
      memory.delete(key);
      return undefined;
    },

    async set(key, value) {
      if (valkey()) {
        const redis = await connected();
        if (!redis) return;
        try {
          await redis.set(full(key), JSON.stringify(value), "EX", ttlSeconds);
        } catch {
          // skipped: the next request redoes the work
        }
        return;
      }
      if (memory.size >= memoryMax) memory.delete(memory.keys().next().value!);
      memory.set(key, { until: Date.now() + ttlSeconds * 1000, value });
    },
  };
}
