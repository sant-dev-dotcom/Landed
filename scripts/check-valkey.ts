// Checks the shared cache (lib/cache.ts) can reach Valkey: connects with VALKEY_URL, writes,
// reads and expires a test key, and reports the eviction policy and what Landed has cached.
// Run with: npm run check:valkey
// Run it on the server (the database only accepts connections from its private IP).
import Redis from "ioredis";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Use the environment as-is.
}
const url = process.env.VALKEY_URL;
if (!url) {
  console.error("VALKEY_URL is not set (.env.local or environment). Without it, Landed caches in memory.");
  process.exit(1);
}

const redis = new Redis(url, { connectTimeout: 5_000, maxRetriesPerRequest: 1, lazyConnect: true });
redis.on("error", () => {}); // reported below
let problems = 0;
const ok = (msg: string) => console.log(`  ok    ${msg}`);
const fail = (msg: string) => (problems++, console.log(`  FAIL  ${msg}`));

try {
  await redis.connect();
  ok(`connected (${url.startsWith("rediss://") ? "TLS" : "no TLS: Vultr needs rediss://"})`);
  if (!url.startsWith("rediss://")) problems++;

  const key = `landed:check:${Date.now()}`;
  await redis.set(key, "1", "EX", 2);
  if ((await redis.get(key)) === "1") ok("write and read");
  else fail("wrote a test key but couldn't read it back");
  await new Promise((r) => setTimeout(r, 2_500));
  if ((await redis.get(key)) === null) ok("expiry (keys disappear when their time is up)");
  else fail("test key didn't expire");

  // INFO usually works on managed databases even where CONFIG is blocked.
  const memory = await redis.info("memory");
  const policy = memory.match(/maxmemory_policy:(\S+)/)?.[1] ?? "unknown";
  const used = memory.match(/used_memory_human:(\S+)/)?.[1] ?? "?";
  const max = memory.match(/maxmemory_human:(\S+)/)?.[1] ?? "?";
  if (policy === "allkeys-lru") ok(`eviction policy ${policy}`);
  else fail(`eviction policy is ${policy}: set it to allkeys-lru in Vultr → Databases → Settings`);
  console.log(`        memory used ${used} of ${max}`);

  const counts: Record<string, number> = {};
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "landed:*", "COUNT", 500);
    cursor = next;
    for (const k of keys) {
      const ns = k.split(":")[1];
      counts[ns] = (counts[ns] ?? 0) + 1;
    }
  } while (cursor !== "0");
  const summary = Object.entries(counts).map(([ns, n]) => `${ns} ${n}`).join(", ");
  console.log(`        cached: ${summary || "nothing yet (open a page or pick a language in the app)"}`);
} catch (err) {
  fail(`couldn't reach Valkey: ${err instanceof Error ? err.message : err}`);
  console.log("        Check the URL and password, and that this machine's IP is a trusted source.");
} finally {
  redis.disconnect();
}

console.log(problems ? `\n${problems} problem(s).` : "\nValkey is ready for Landed.");
process.exit(problems ? 1 : 0);
