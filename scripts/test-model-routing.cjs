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

const keys = ["MUSE_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER", "GEMINI_MODEL", "META_MODEL_API_BASE", "MUSE_SEARCH_MODEL"];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const realFetch = global.fetch;
let calls = [], failure = "";
process.env.MUSE_API_KEY = "test-muse";
process.env.GEMINI_API_KEY = "test-gemini";
process.env.LLM_PROVIDER = "gemini"; // Legacy configuration cannot move chat back to Gemini.
process.env.META_MODEL_API_BASE = "https://muse.example/v1";
process.env.MUSE_SEARCH_MODEL = "test-muse-model";
delete process.env.GEMINI_MODEL;
global.fetch = async (url, options) => {
  calls.push({ url: String(url), body: JSON.parse(options.body) });
  const muse = String(url).includes("muse.example");
  if (muse && failure === "muse") return new Response("Unavailable", { status: 500 });
  if (muse && failure === "unauthorized") return new Response("Unauthorized", { status: 401 });
  if (!muse && failure === "first-model" && String(url).includes("gemini-3.5-flash-lite")) return new Response("Not found", { status: 404 });
  const text = muse ? (failure === "json" ? "invalid json" : '{"answer":"Muse answer"}') : '{"answer":"Gemini translation"}';
  return Response.json(muse
    ? { output: [{ type: "message", content: [{ type: "output_text", text }] }] }
    : { candidates: [{ content: { parts: [{ text }] } }] });
};

const muse = load("lib/muse.ts", { "server-only": {} });
const llm = load("lib/llm.ts", {
  "server-only": {}, "./muse": muse,
  "@/i18n/languages": { CUSTOM_LOCALE: "und", languageInfo: () => ({ english: "English", native: "English" }) },
});
const prompt = { system: 'Return JSON: {"answer": string}', user: "Test question" };

(async () => {
  assert.deepEqual(await llm.generateJSON(prompt), { answer: "Muse answer" });
  assert.equal(calls[0].url, "https://muse.example/v1/responses");
  assert.equal(calls[0].body.model, "test-muse-model");
  assert.equal(calls.length, 1);
  await llm.generateJSON({ ...prompt, image: { mimeType: "image/jpeg", base64: "sample" } });
  assert.equal(calls.at(-1).body.input[0].content[1].image_url, "data:image/jpeg;base64,sample");
  console.log("PASS: default chat and document analysis use the same Muse Spark Responses connection as web search");

  const mask = { asLocale: () => "en", clip: (value, length) => String(value ?? "").slice(0, length), maskIds: (value) => value };
  const json = { NextResponse: { json: Response.json } };
  const chat = load("app/api/scan/chat/route.ts", { "next/server": json, "@/lib/llm": llm, "@/lib/mask": mask });
  const chatResponse = await chat.POST(new Request("https://landed.test/api/scan/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What does this mean?", selection: "Sample passage", documentText: "Sample document" }),
  }));
  assert.equal(chatResponse.status, 200);
  assert.equal((await chatResponse.json()).answer, "Muse answer");
  assert(calls.at(-1).url.includes("muse.example"));

  calls = [];
  assert.deepEqual(await llm.generateJSON({ ...prompt, onlyGemini: llm.FLASH_LITE_MODELS }), { answer: "Gemini translation" });
  assert.equal(calls.length, 1); assert(calls[0].url.includes("generativelanguage.googleapis.com"));
  console.log("PASS: document chat uses Muse; explicit translation uses Gemini");

  delete process.env.MUSE_API_KEY;
  assert.equal(llm.isLLMConfigured(), false); assert.equal(llm.isGeminiConfigured(llm.FLASH_LITE_MODELS), true);
  calls = [];
  await assert.rejects(llm.generateJSON(prompt), /Muse Spark is not configured/);
  assert.equal(calls.length, 0, "a Gemini key alone cannot answer chat");
  const page = { title: "Translated", blocks: [], requiresSite: false, siteAction: "" };
  const translation = load("app/api/translate-page/route.ts", {
    "next/server": json, "@/lib/llm": llm, "@/lib/mask": mask,
    "@/lib/links": { isTrusted: () => true },
    "@/lib/pages": { fetchTrusted: async () => ({ url: "https://example.gov/page" }), formattedPage: async () => page, pageLanguages: () => ({ lang: "en" }) },
  });
  const req = () => new Request("https://landed.test/api/translate-page?url=https://example.gov/page&lang=en");
  assert.equal((await translation.GET(req())).status, 200, "Gemini translation works without Muse");
  process.env.MUSE_API_KEY = "test-muse";
  delete process.env.GEMINI_API_KEY;
  assert.equal((await translation.GET(req())).status, 503, "Muse cannot substitute for a missing Gemini translation key");
  assert.equal(llm.isLLMConfigured(), true);
  process.env.GEMINI_API_KEY = "test-gemini";
  console.log("PASS: chat and translation configuration checks are independent");

  for (failure of ["muse", "json"]) {
    calls = [];
    await assert.rejects(llm.generateJSON(prompt));
    assert.equal(calls.length, 1); assert(calls[0].url.includes("muse.example"));
  }
  failure = "first-model"; calls = [];
  await llm.generateJSON({ ...prompt, onlyGemini: llm.FLASH_LITE_MODELS });
  assert.equal(calls.length, 2); assert(calls.every((call) => call.url.includes("generativelanguage.googleapis.com")));
  console.log("PASS: Muse failures never fall back to Gemini; translation retries remain within Gemini");

  failure = "unauthorized"; calls = [];
  await assert.rejects(llm.generateJSON(prompt));
  assert.equal(llm.isLLMConfigured(), false);
  assert.equal(llm.isGeminiConfigured(llm.FLASH_LITE_MODELS), true);
  assert.equal(calls.length, 1);
  console.log("PASS: rejected Muse credentials disable chat without disabling Gemini translation");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = realFetch;
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});
