// Acceptance tests for Ask Landed, run against a running app (npm run dev).
// Run with: npm run test:assistant   (BASE_URL defaults to http://localhost:3000)
// Plays the device's part: routes each question to data stores with the same router the app
// uses, supplies sample data only for those stores (or when the server asks), and checks that
// no unrelated store is ever sent.
import { isTrusted } from "../lib/links.ts";
import { routeStores, type AssistantAnswer, type AssistantResponse, type DataRequest, type Store } from "../lib/assistant.ts";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// What the device would read from IndexedDB.
const DEVICE: Record<Store, unknown> = {
  profile: { city: "Houston, TX", originCountry: "Venezuela", languages: ["Spanish", "English"], monthsInUSAtSignup: 1, hasChildren: false },
  dates: [
    { label: "Work permit expires", docType: "Work permit", date: inDays(140), daysFromToday: 140 },
    { label: "Court hearing", docType: "Court notice", date: inDays(45), daysFromToday: 45 },
  ],
  checklist: [
    { id: "i94", section: "start", done: true, doneOn: inDays(-2) },
    { id: "ssn", section: "start", done: false },
    { id: "bank", section: "start", done: false },
  ],
  plan: [{ title: "Find free legal help nearby", category: "legal", dueInDays: 14, done: false }],
  prepSummaries: { appointmentPrep: null, savedQuestions: [] },
};

async function ask(message: string, locale = "en") {
  const routed = routeStores(message);
  const sent = new Set<Store>(routed);
  let data: Partial<Record<Store, unknown>> = Object.fromEntries(routed.map((s) => [s, DEVICE[s]]));
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${BASE}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, locale, history: [], data }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as AssistantResponse;
    if ("answer" in body) return { answer: body.answer, routed, sent: [...sent] };
    for (const r of body.needData as DataRequest[]) {
      sent.add(r.store);
      data = { ...data, [r.store]: DEVICE[r.store] };
    }
  }
  throw new Error("no answer after 4 rounds");
}

type Check = [string, boolean];
const results: { name: string; checks: Check[]; answer?: AssistantAnswer; sent?: Store[]; error?: string }[] = [];

async function test(name: string, message: string, checks: (a: AssistantAnswer, sent: Store[]) => Check[]) {
  try {
    const { answer, sent } = await ask(message);
    results.push({ name, checks: checks(answer, sent), answer, sent });
  } catch (err) {
    results.push({ name, checks: [["request succeeded", false]], error: err instanceof Error ? err.message : String(err) });
  }
}

const external = (a: AssistantAnswer) => a.links.filter((l) => l.type === "external");
const allTrusted = (a: AssistantAnswer): Check => ["every external link is allowlisted", external(a).every((l) => isTrusted(l.url))];

await test("Work permit date from saved dates", "When does my work permit expire?", (a, sent) => {
  const date = (DEVICE.dates as { date: string }[])[0].date;
  const [y, m] = date.split("-").map(Number);
  const month = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" });
  return [
    ["mentions the saved date", a.text.includes(date) || a.text.includes(month)],
    ["cites your saved dates", a.usedData.includes("dates")],
    ["only the dates store was sent", sent.every((s) => s === "dates")],
    allTrusted(a),
  ];
});

await test("I-94 answered from trusted sources", "What is an I-94?", (a, sent) => [
  ["at least one trusted link", external(a).length > 0],
  allTrusted(a),
  ["marked as legal (AI label)", a.isLegal],
  ["no personal data sent", sent.length === 0],
]);

await test("Travel question is case-specific", "Can I travel to Venezuela with my pending application?", (a, sent) => [
  ["shows the legal help card", a.helpCard],
  ["general info with a trusted link", external(a).length > 0],
  allTrusted(a),
  ["no personal data sent", sent.length === 0],
]);

await test("No trusted source: says so, points to help", "What is the 2031 quota for the Mongolian yak herder special visa program?", (a) => [
  ["points to official help / legal help card", a.helpCard],
  allTrusted(a),
]);

await test("Checklist progress from the checklist", "What's left on my list?", (a, sent) => [
  ["cites your checklist", a.usedData.includes("checklist")],
  ["only the checklist store was sent", sent.every((s) => s === "checklist")],
]);

await test("Profile question", "What city did I set?", (a, sent) => [
  ["mentions Houston", /houston/i.test(a.text)],
  ["cites your profile", a.usedData.includes("profile")],
  ["only the profile store was sent", sent.every((s) => s === "profile")],
]);

let failed = 0;
for (const r of results) {
  const ok = r.checks.every(([, pass]) => pass);
  if (!ok) failed++;
  console.log(`\n${ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const [label, pass] of r.checks) console.log(`   ${pass ? "✓" : "✗"} ${label}`);
  if (r.error) console.log(`   error: ${r.error}`);
  if (r.answer) {
    console.log(`   sent stores: [${r.sent!.join(", ")}]  used: [${r.answer.usedData.join(", ")}]  legal=${r.answer.isLegal} helpCard=${r.answer.helpCard}`);
    console.log(`   answer: ${r.answer.text.replace(/\s+/g, " ").slice(0, 260)}`);
    for (const l of r.answer.links) console.log(`   link: [${l.type}${l.sourceType ? "/" + l.sourceType : ""}] ${l.title} -> ${l.url}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
