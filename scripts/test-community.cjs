// Regression checks for Community selection and search interactions, without network calls.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");

function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id), module, module.exports
  );
  return module.exports;
}

function hooks() {
  const slots = [], effects = [];
  let index = 0, dirty = true;
  const api = {
    ...React,
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value) => {
        const next = typeof value === "function" ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
      }];
    },
    useRef(value) { const i = index++; return slots[i] ??= { current: value }; },
    useMemo(fn, deps) {
      const i = index++, old = slots[i];
      if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return api.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = index++, old = slots[i];
      if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) {
        slots[i] = { deps, cleanup: old?.cleanup };
        effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  return {
    api,
    render(Component) {
      let tree, count = 0;
      do {
        dirty = false; index = 0; tree = Component();
        effects.splice(0).forEach((fn) => fn());
        assert(++count < 30, "render loop");
      } while (dirty);
      return tree;
    },
    cleanup() { slots.forEach((s) => s?.cleanup?.()); },
  };
}

function nodes(tree, predicate, out = []) {
  if (Array.isArray(tree)) tree.forEach((n) => nodes(n, predicate, out));
  else if (tree && typeof tree === "object" && tree.props) {
    if (predicate(tree)) out.push(tree);
    nodes(tree.props.children, predicate, out);
  }
  return out;
}

const Stub = () => null;
const requests = [], general = [], writes = [], runner = hooks();
let saved = [], savedCustom = [];
const mocks = {
  react: runner.api,
  "next-intl": { useLocale: () => "en", useTranslations: () => (key) => key },
  "@/lib/hooks": {
    useProfile: () => [{ city: "Houston, TX" }, true],
    useEventInterests: () => [saved, true], useCustomInterests: () => [savedCustom, true],
  },
  "@/lib/client": {
    getJSON: (url, signal) => new Promise((resolve) => general.push({ url, signal, resolve })),
    getJSONLines: (url, onLine, signal) => new Promise((resolve, reject) => requests.push({ url, onLine, signal, resolve, reject })),
  },
  "@/lib/storage": {
    saveEventInterests: async (value) => { writes.push(["interests", value]); },
    saveCustomInterests: async (value) => { writes.push(["custom", value]); },
  },
  "@/lib/eventCache": { cacheEvents() {} },
  "@/lib/demoEvents": { demoEvents: () => [{ id: "demo", title: "Instant demo event" }] },
  "@/lib/interests": {
    EVENT_INTERESTS: ["jobs", "family", "english"].map((id) => ({ id })),
    cleanCustomInterest: (s) => s.trim(), MAX_CUSTOM_INTERESTS: 5, CUSTOM_INTEREST_LENGTH: 60,
  },
};
for (const [file, names] of Object.entries({
  "ios/NavBar": ["NavBar"], "ios/GroupedList": ["GroupedList"], "ios/ListSection": ["ListSection"],
  "ios/ListRow": ["ListRow"], "ios/SegmentedControl": ["SegmentedControl"], "ios/Screen": ["Screen"],
  "ios/Button": ["Button", "ButtonLink"], "ios/Spinner": ["Spinner"], "EventDateBadge": ["DateBadge"],
  "ForumSection": ["ForumSection"], "PostedEventsSection": ["PostedEventsSection"],
})) mocks[`@/components/${file}`] = Object.fromEntries(names.map((name) => [name, Stub]));

const Page = load("app/[locale]/(tabs)/social/page.tsx", mocks).default;
const render = () => runner.render(Page);
const action = (tree) => nodes(tree, (n) => n.type === Stub && ["findEvents", "showAllEvents"].includes(n.props.children))[0];
const chip = (tree, id) => nodes(tree, (n) => n.type === "button" && n.props.children === `interest_${id}`)[0];
const selected = (tree) => ["jobs", "family", "english"].filter((id) => chip(tree, id).props["aria-pressed"]);
const tick = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  let tree = render();
  assert.equal(requests.length, 0, "opening Community must not start Muse Spark");
  assert.equal(general.length, 1, "opening Community loads the general SerpApi feed");
  assert(general[0].url.startsWith("/api/events?"));
  const switchView = (value) => {
    nodes(tree, (n) => n.type === Stub && n.props.options?.some((option) => option.value === "web"))[0].props.onChange(value);
    tree = render();
  };
  switchView("landed"); switchView("web");
  assert.equal(requests.length, 0, "switching Community views must not start Muse Spark");
  assert.equal(general.length, 1, "switching views does not duplicate the general request");
  console.log("PASS: opening Community loads SerpApi once; switching views never starts Muse Spark");
  chip(tree, "jobs").props.onClick(); tree = render();
  chip(tree, "family").props.onClick(); tree = render();
  // The first IndexedDB write notifies subscribers after the second click.
  saved = ["jobs"]; tree = render();
  assert.deepEqual(selected(tree), ["jobs", "family"], "a delayed storage notification must not remove a newer selection");
  saved = ["jobs", "family"]; tree = render();
  chip(tree, "jobs").props.onClick(); chip(tree, "english").props.onClick(); tree = render();
  assert.deepEqual(selected(tree), ["family", "english"], "rapid clicks must combine against the latest selection");
  saved = ["jobs", "family"]; tree = render();
  assert.deepEqual(selected(tree), ["family", "english"], "old saved values must not reselect a removed filter");
  console.log("PASS: multiple and rapid filter selections survive delayed storage updates");

  for (const value of ["chess", "dance"]) {
    nodes(tree, (n) => n.type === "input")[0].props.onChange({ target: { value } }); tree = render();
    nodes(tree, (n) => n.type === "form")[0].props.onSubmit({ preventDefault() {} }); tree = render();
  }
  savedCustom = ["chess"]; tree = render();
  assert.equal(requests.length, 0, "changing and restoring filters must not start Muse Spark");
  assert.equal(action(tree).props.disabled, false);
  action(tree).props.onClick(); tree = render();
  const params = new URL(requests[0].url, "https://landed.test").searchParams;
  assert.deepEqual(params.get("interests").split(",").sort(), ["english", "family"]);
  assert.deepEqual(params.getAll("custom"), ["chess", "dance"]);
  assert(general[0].signal.aborted, "filtered search cancels background general search");
  general[0].resolve({ events: [{ title: "Stale general results" }] }); await tick(); tree = render();
  assert.equal(action(tree).props.disabled, true);
  await tick();
  assert.deepEqual(writes.filter(([kind]) => kind === "interests").at(-1)[1], ["family", "english"]);
  console.log("PASS: request and persisted preferences contain every selected built-in and custom filter");

  requests[0].onLine({ type: "search", id: "q", query: "family events and English classes" });
  requests[0].onLine({ type: "searched", id: "q", query: "family events and English classes", results: 4 });
  requests[0].onLine({ type: "read", id: "r", site: "community.example" });
  requests[0].onLine({ type: "check", id: "c", site: "community.example", ok: true });
  requests[0].onLine({ type: "done", events: [{ title: "Combined filter results" }] });
  requests[0].resolve(); await tick(); tree = render();
  assert.equal(action(tree).props.disabled, false);
  const dropdown = nodes(tree, (n) => n.type === "button" && n.props["aria-expanded"] !== undefined)[0];
  assert(dropdown); dropdown.props.onClick(); tree = render();
  const log = nodes(tree, (n) => n.type === "ol")[0];
  assert.equal(nodes(log, (n) => n.type === "li").length, 3);
  console.log("PASS: combined search completes, Find Events can retry, and the full search history still expands");

  chip(tree, "family").props.onClick(); chip(tree, "english").props.onClick(); tree = render();
  nodes(tree, (n) => n.type === "button" && n.props["aria-label"] === "removeCustom").forEach((button) => button.props.onClick());
  tree = render();
  assert.equal(action(tree).props.children, "showAllEvents");
  action(tree).props.onClick(); tree = render();
  assert.equal(requests.length, 1, "All Events must not call Muse Spark");
  assert.equal(general.length, 2, "All Events requests the general SerpApi feed");
  general[1].resolve({ events: [{ title: "SerpApi all-events result" }] }); await tick(); tree = render();
  assert(nodes(tree, (n) => n.type === Stub && n.props.title === "SerpApi all-events result").length);
  assert.equal(action(tree).props.disabled, false);
  console.log("PASS: clearing filters and Show All Events return SerpApi results without Muse Spark");

  chip(tree, "jobs").props.onClick(); tree = render(); action(tree).props.onClick(); tree = render();
  requests[1].reject(new Error("Muse unavailable")); await tick(); tree = render();
  assert.equal(general.length, 3, "failed Muse discovery falls back to SerpApi");
  general[2].resolve({ events: [{ title: "SerpApi fallback result" }] }); await tick(); tree = render();
  assert(nodes(tree, (n) => n.type === Stub && n.props.title === "SerpApi fallback result").length);
  console.log("PASS: Muse failure also uses the SerpApi feed");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  runner.cleanup();
  general.forEach((request) => request.resolve({ events: [] }));
  requests.forEach((request) => request.resolve());
  await tick();
});
