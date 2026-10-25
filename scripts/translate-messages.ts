// Generate messages/<code>.json for the bundled languages from messages/en.json with Gemini.
// Run with: npm run translate:messages            (new languages in full; existing files get only
//                                                   the strings they're missing)
//           npm run translate:messages -- fr ko   (just these, in full, overwriting)
//           npm run translate:messages -- --all   (every language except en and es, in full)
// Spanish is hand-written; pass "es" explicitly to regenerate it anyway.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LANGUAGES } from "../i18n/languages.ts";
import { flatten, TRANSLATE_MODEL, translateMessages, unflatten, type MessageTree } from "../lib/translateUi.ts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Use the environment as-is.
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set (.env.local or environment).");
  process.exit(1);
}

const args = process.argv.slice(2);
const named = args.filter((a) => !a.startsWith("--"));
const full = named.length > 0 || args.includes("--all");
const targets = LANGUAGES.filter((l) => (named.length ? named.includes(l.code) : l.code !== "en" && l.code !== "es"));

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as MessageTree;
const enFlat = flatten(en);
let problems = 0;
for (const lang of targets) {
  const file = `messages/${lang.code}.json`;
  const existing = !full && existsSync(file) ? flatten(JSON.parse(readFileSync(file, "utf8"))) : null;
  // Keep only keys English still has; translate the ones the file lacks.
  const source = existing ? unflatten(Object.fromEntries(Object.entries(enFlat).filter(([k]) => !(k in existing)))) : en;
  const count = Object.keys(flatten(source)).length;
  if (!count) continue;

  const started = Date.now();
  const name = lang.english === lang.native ? lang.english : `${lang.english} (${lang.native})`;
  try {
    const { messages, untranslated } = await translateMessages(source, name, { apiKey, model: TRANSLATE_MODEL, retries: 5 });
    const added = flatten(messages);
    // Strings that failed are left out (not stored in English), so the next run retries them;
    // the app shows English for them meanwhile.
    const failed = new Set(untranslated);
    const merged = existing
      ? unflatten(Object.fromEntries(Object.keys(enFlat).filter((k) => k in existing || !failed.has(k)).map((k) => [k, existing[k] ?? added[k]])))
      : messages;
    writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf8");
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const what = existing ? `${count} new string${count === 1 ? "" : "s"}` : "done";
    console.log(`${lang.code}  ${lang.english}: ${what} in ${secs}s${untranslated.length ? `, ${untranslated.length} left in English: ${untranslated.join(", ")}` : ""}`);
    if (untranslated.length) problems++;
  } catch (err) {
    problems++;
    console.error(`${lang.code}  ${lang.english}: FAILED`, err instanceof Error ? err.message : err);
  }
}
process.exit(problems ? 1 : 0);
