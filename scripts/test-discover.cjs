// Broader discovery must increase coverage without admitting unverified events.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id), module, module.exports
  );
  return module.exports;
}

const clip = (value, max) => String(value ?? "").slice(0, max);
const checker = load("lib/eventPage.ts", { "server-only": {}, "./mask": { clip } });
const interests = load("lib/interests.ts", {});
const cache = new Map(), pages = new Map(), calls = [];
const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
function fixture(number) {
  const event = { title: `Community workshop number ${number}`, date, url: `https://events.example/workshop-${number}` };
  pages.set(event.url, `<html><script type="application/ld+json">${JSON.stringify({
    "@type": "Event", name: event.title, startDate: date,
    description: "Meet community members and learn useful skills together.",
    location: { name: "Community Center", address: { addressLocality: "Houston", addressRegion: "TX" } },
  })}</script></html>`);
  return event;
}
let scenario = "broad";
const { GET } = load("app/api/events/discover/route.ts", {
  "next/server": { NextResponse: { json: Response.json } },
  "@/lib/cache": { createCache: () => ({ get: async (key) => cache.get(key), set: async (key, value) => cache.set(key, value) }) },
  "@/lib/eventPage": { ...checker, fetchPage: async (url) => { if (!pages.has(url)) throw new Error("unreadable"); return pages.get(url); } },
  "@/lib/events": { eventId: (title, date) => `${title}|${date}` },
  "@/lib/interests": interests,
  "@/lib/llm": { languageName: () => "English" },
  "@/lib/mask": { clip, asLocale: () => "en" },
  "@/lib/muse": {
    isMuseConfigured: () => true,
    museWebSearch: async (instructions, input, options) => {
      calls.push({ instructions, input, options });
      options.onStep({ kind: "search", id: "same-id", query: "Find local upcoming events" });
      options.onStep({ kind: "searched", id: "same-id", query: "Find local upcoming events", results: 15 });
      const local = input.includes("Search focus: Prioritize organizer");
      const extra = input.includes("Search focus: Find additional");
      if (scenario === "failure" || (scenario === "partial" && !local)) throw new Error("provider timeout");
      let found;
      if (scenario === "broad") {
        found = Array.from({ length: 15 }, (_, i) => fixture(local ? i : i + 10));
        // Valid-looking search claims with no confirming page must still be dropped.
        found.push({ title: "Imaginary invented festival", date, url: "https://events.example/imaginary" });
        pages.set("https://events.example/imaginary", "<html>There is no event here.</html>");
        found.push({ title: "Unreadable event listing", date, url: "https://events.example/blocked" });
        found.push({ ...fixture(99), date: "2020-01-01" });
        found.push({ ...fixture(98), url: "https://never-searched.example/fake" });
      } else if (scenario === "topup") {
        found = extra ? [fixture(42), fixture(43)] : [fixture(local ? 40 : 41)];
      } else found = [fixture(30), fixture(31)];
      return { text: JSON.stringify(found), sources: found.filter((e) => !e.url.includes("never-searched")).map((e) => e.url) };
    },
  },
});

async function discover(city) {
  const response = await GET(new Request(`https://landed.test/api/events/discover?city=${city}&lang=en&interests=family,english`));
  return (await response.text()).trim().split("\n").map(JSON.parse);
}

(async () => {
  const lines = await discover("Broad");
  const done = lines.find((line) => line.type === "done");
  assert.equal(done.events.length, 25, "combine complementary results beyond the former 10-event limit");
  assert(done.events.every((event) => event.checked && event.link.startsWith("https://events.example/workshop-")));
  assert.equal(new Set(done.events.map((event) => event.id)).size, 25);
  assert(calls.every((call) => call.input.includes("match ANY") && call.input.includes("do not require an event to match all")));
  assert(lines.some((line) => line.type === "check" && line.ok === false));
  assert.equal(calls.length, 2, "enough verified events avoids an unnecessary extra search");
  assert.equal(new Set(lines.filter((line) => line.type === "search").map((line) => line.id)).size, 2);
  console.log("PASS: broader results, deduplication, multiple-interest matching; invented, expired, unsearched and unreadable events excluded");

  const cached = await discover("Broad");
  assert.equal(calls.length, 2);
  assert.equal(cached.at(-1).cached, true);
  assert(cached.some((line) => line.type === "search") && cached.some((line) => line.type === "check"));
  console.log("PASS: cached searches replay the full search history for the dropdown");

  scenario = "topup";
  const topped = await discover("Topup");
  assert.equal(topped.at(-1).events.length, 4);
  assert(calls.at(-1).input.includes("Exclude these already checked"));
  console.log("PASS: sparse successful searches get an additional pass and merge verified results");

  scenario = "partial";
  const partial = await discover("Partial");
  assert.equal(partial.at(-1).events.length, 2);
  console.log("PASS: one failed search and a failed extra pass preserve previously verified events");

  scenario = "failure";
  const failed = await discover("Failure");
  assert.equal(failed.at(-1).type, "error");
  console.log("PASS: complete provider failures remain errors, with no fabricated results");
})().catch((error) => { console.error(error); process.exitCode = 1; });
