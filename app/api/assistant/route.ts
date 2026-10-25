import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { CLASSIFIER_PROMPT, classify, isLegalTopic } from "@/lib/classify";
import { intlTag, type Locale } from "@/i18n/languages";
import { generateJSON, isLLMConfigured, languageName } from "@/lib/llm";
import { asLocale, clip, maskDeep } from "@/lib/mask";
import { getItem, ITEMS } from "@/lib/checklist";
import { isTrusted, sourceType } from "@/lib/links";
import { findHelp } from "@/lib/help";
import { findEvents } from "@/lib/events";
import { getItemDetails, searchTrustedSources, type TrustedResult } from "@/lib/trustedSearch";
import {
  INTERNAL_ROUTE,
  STORES,
  type AssistantAnswer,
  type AssistantRequest,
  type ChatLink,
  type DataFilters,
  type Proposal,
  type Store,
} from "@/lib/assistant";

// Ask Landed: a tool-calling agent over the person's own data (sent by the device, one
// slice at a time) and trusted sources. Stateless: nothing here is stored or logged. If the
// model needs a slice the device didn't send, we return { needData } and the device sends
// it with the next request.

export const maxDuration = 60;

const MAX_STEPS = 6;
const DATA_LIMIT = 12_000;

interface Step {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

type ModelTurn =
  | { tool: string; args?: Record<string, unknown> }
  | {
      final: {
        text?: string;
        links?: { url?: string; title?: string }[];
        usedData?: string[];
        isLegal?: boolean;
        needsLegalHelp?: boolean;
        followUps?: string[];
      };
    };

const itemIds = ITEMS.map((i) => i.id).join(", ");

const systemPrompt = (language: string, today: string) => `You are "Ask Landed", the assistant inside Landed, an app for immigrants in their first year in the US.
Answer in ${language}. Use plain, warm words at a 6th-grade reading level. Keep answers short (under 150 words). Today is ${today}.
Format "text" with simple markdown when it helps: **bold** for the key fact, numbered or bulleted lists with one item per line, and [words](url) links. No tables and no headings.

You work in steps. Every reply is exactly ONE JSON object:
- Use a tool: {"tool": "<name>", "args": {...}}
- Answer: {"final": {"text": string, "links": [{"url": string, "title": string}], "usedData": string[], "isLegal": boolean, "needsLegalHelp": boolean, "followUps": string[]}}
  followUps: 2-3 short questions (under 8 words each, in ${language}) the person might want to ask next, based on their question and data.

TOOLS
- getUserData {"store": "profile"|"dates"|"checklist"|"plan"|"prepSummaries", "filters"?: {"withinDays"?: number, "status"?: "done"|"open", "sinceDays"?: number}}: the person's own data saved on their phone. profile = city, languages, country, time in the US. dates = their saved dates. checklist = their "Things to Take Care Of" items (ids, done, doneOn). plan = their 90-day plan. prepSummaries = their saved appointment questions and summary.
- getItem {"id": string}: a checklist item's explanation, "How to Do It" steps and trusted links. Ids: ${itemIds}.
- searchTrustedSources {"query": string}: official (.gov) and reviewed nonprofit sources.
- markItemDone {"id"} / markItemNotDone {"id"}: PROPOSE a checklist change. The person must confirm it.
- addDate {"label": string, "date": "YYYY-MM-DD", "docType": "workPermit"|"passport"|"uscis"|"court"|"i94"|"lease"|"other"}: PROPOSE saving a date, only when they ask to save one. The person must confirm it.
- findLegalHelp {"city": string, "language"?: string}: free and low-cost legal help near a city.
- findEvents {"city": string, "culture"?: string, "language"?: string, "faith"?: string, "dateRange"?: {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}}: community events.
- openLink {"url": string, "title": string}: add a trusted link button to your answer.

RULES
1. Questions about their own data: answer ONLY from USER_DATA (already in the input) or getUserData results, and say where it came from, for example "From your saved dates: …". Never guess or invent a city, date, checklist item or any other personal fact that is not literally in that data. If the data you need isn't in USER_DATA, call getUserData. If it is empty, say so and say how to add it. Put the stores you used in usedData.
   For a saved date, copy its "dateWritten" exactly (same day, month and YEAR); you may translate the month and weekday names. Use "daysFromToday" for how far away it is.
2. Legal, immigration, tax, benefits, housing-rights or workplace-rights questions: use ONLY the TRUSTED SOURCES in the input and searchTrustedSources results. Cite each source you use with a link (its exact url). Never use general knowledge or other websites for these. If the sources don't answer the question, say plainly that you don't know, point to the official website, and set needsLegalHelp=true. Set isLegal=true.
3. If isCaseSpecific is true: never say what they should file or do in their own case and never predict an outcome or eligibility. Give general information from the sources and set needsLegalHelp=true. You may still state facts from their own saved data.
4. Mixed questions (their data + a legal topic): first state their data, then general information from sources with links, needsLegalHelp=true.
5. "What should I do first?" and similar: use their profile (time in the US), open checklist items and upcoming dates to suggest 2-3 priorities, for example "You've been here 1 month, so start with your Social Security number and a bank account."
6. Links: external urls must come from tool results or the TRUSTED SOURCES. You may also link app pages: /legal/checklist, /legal/checklist/<id>, /legal/help, /legal, /home, /social, /jobs, /settings. You can put links inside the text as [words](url).
7. Changes to their data happen only through markItemDone, markItemNotDone or addDate. Never say something was saved; say they can confirm it below.
8. Never ask for or repeat ID numbers.`;

/** "Sunday, March 14, 2027": smaller models copy a written-out date more reliably than an ISO one. */
const spelled = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
};

function filterData(store: Store, data: unknown, f: DataFilters = {}): unknown {
  if (!Array.isArray(data)) return data;
  if (store === "dates") {
    return data
      .filter((d: { daysFromToday?: number }) =>
        f.withinDays === undefined ? true : typeof d.daysFromToday === "number" && d.daysFromToday >= -30 && d.daysFromToday <= f.withinDays
      )
      .map((d: { date?: string }) => (typeof d.date === "string" ? { ...d, dateWritten: spelled(d.date) } : d));
  }
  if (store === "checklist" || store === "plan") {
    const since = f.sinceDays === undefined ? 0 : Date.now() - f.sinceDays * 86_400_000;
    return data
      .filter((d: { done?: boolean }) => (f.status === "done" ? d.done : f.status === "open" ? !d.done : true))
      .filter((d: { doneOn?: string }) => (since ? d.doneOn && new Date(d.doneOn).getTime() >= since : true))
      .map((d: { id?: string }) => (store === "checklist" && d.id ? { ...d, title: getItemDetails(d.id, "en")?.title } : d));
  }
  return data;
}

/** Accept the shapes smaller models drift into: flattened args, "name" for "tool", a bare answer. */
function normalizeTurn(raw: unknown): ModelTurn | null {
  const o = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  if (o.final && typeof o.final === "object") return o as ModelTurn;
  const tool = typeof o.tool === "string" ? o.tool : typeof o.name === "string" ? o.name : null;
  if (tool) {
    const { tool: _t, name: _n, args, arguments: a2, ...rest } = o;
    const given = (args ?? a2) as Record<string, unknown> | undefined;
    return { tool, args: given && typeof given === "object" ? given : rest };
  }
  if (typeof o.text === "string") return { final: o as never };
  if (typeof o.answer === "string") return { final: { ...o, text: o.answer } as never };
  return null;
}

const validDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<AssistantRequest>;
  const message = clip(body.message, 800).trim();
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });

  const locale = asLocale(body.locale);
  const language = languageName(locale, req);
  const history = (Array.isArray(body.history) ? body.history : []).slice(-8).map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", text: clip(h.text, 600) }));
  const itemId = body.context?.itemId && getItem(body.context.itemId) ? body.context.itemId : undefined;
  // Only the slices the device chose to send. Masked again here; capped in size.
  const data: Partial<Record<Store, unknown>> = {};
  for (const s of STORES) {
    if (body.data && s in body.data) {
      let v = maskDeep(body.data[s]);
      while (Array.isArray(v) && v.length && JSON.stringify(v).length > DATA_LIMIT) v = v.slice(0, -1);
      data[s] = JSON.stringify(v ?? null).length > DATA_LIMIT ? null : v;
    }
  }

  // Known before the AI runs, so a limited answer can still use them if it fails.
  let isCaseSpecific = false;
  let legal = isLegalTopic(message);
  let trusted: TrustedResult[] = [];

  try {
    // 1. Case-specific check on every message (rules first; the AI only when ambiguous).
    ({ isCaseSpecific } = await classify(message, async (q) =>
      (await generateJSON<{ isCaseSpecific: boolean }>({ system: CLASSIFIER_PROMPT, user: q, temperature: 0 })).isCaseSpecific === true
    ));
    legal = isCaseSpecific || legal;

    // 2. Legal topics: trusted sources first, always.
    trusted = legal ? await searchTrustedSources(message, locale) : [];

    // No AI available right now: answer what we can without it.
    if (!isLLMConfigured()) {
      return NextResponse.json({ answer: await limitedAnswer({ locale, legal, isCaseSpecific, trusted, data }) });
    }

    const allowed = new Map<string, ChatLink>();
    const allow = (url: string, title: string) => {
      const type = sourceType(url);
      if (type && !allowed.has(url)) allowed.set(url, { type: "external", url, title: clip(title, 120), sourceType: type });
    };
    trusted.forEach((r) => allow(r.url, r.title));

    const steps: Step[] = [];
    // The slices the device sent for this question go straight into the prompt, so the
    // answer doesn't depend on the model remembering to call getUserData.
    const provided = Object.fromEntries((Object.keys(data) as Store[]).map((s) => [s, filterData(s, data[s])]));
    const usedStores = new Set<Store>(Object.keys(data) as Store[]);
    const proposals: Proposal[] = [];

    for (let i = 0; i < MAX_STEPS; i++) {
      const user = JSON.stringify({
        context: itemId ? { checklistItem: getItemDetails(itemId, locale) } : undefined,
        history,
        message,
        isCaseSpecific,
        isLegalTopic: legal,
        USER_DATA: Object.keys(provided).length ? provided : undefined,
        TRUSTED_SOURCES: legal ? trusted.map(({ title, url, excerpt, sourceType: type }) => ({ title, url, type, excerpt })) : undefined,
        steps,
        note: i === MAX_STEPS - 1 ? "This is your last step: reply with final now." : undefined,
      });
      const turn = normalizeTurn(
        await generateJSON<unknown>({ system: systemPrompt(language, new Date().toISOString().slice(0, 10)), user, temperature: 0.2 })
      );
      if (!turn) {
        steps.push({ tool: "invalid", args: {}, result: { error: 'Reply with ONE JSON object: {"tool": ..., "args": ...} or {"final": {...}}.' } });
        continue;
      }

      if ("final" in turn && turn.final) {
        const f = turn.final;
        const isAllowed = (url: string) => INTERNAL_ROUTE.test(url) || allowed.has(url);
        // Inline [words](url) links: keep only allowed targets.
        const text = maskDeep(clip(f.text, 3000)).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, words: string, url: string) => (isAllowed(url) ? m : words));
        const links: ChatLink[] = [];
        for (const l of f.links ?? []) {
          const url = typeof l.url === "string" ? l.url.trim() : "";
          const title = clip(l.title, 120) || url;
          if (INTERNAL_ROUTE.test(url)) links.push({ type: "internal", url, title });
          else if (allowed.has(url)) links.push({ ...allowed.get(url)!, title });
        }
        // Legal answers always cite: add the top sources if the model left them out.
        if (legal && !links.some((l) => l.type === "external")) links.push(...[...allowed.values()].slice(0, 2));
        const isLegal = legal || f.isLegal === true;
        const answer: AssistantAnswer = {
          text,
          links: [...new Map(links.map((l) => [l.url, l])).values()].slice(0, 6),
          usedData: (f.usedData ?? []).filter((s): s is Store => usedStores.has(s as Store)),
          isLegal,
          helpCard: isCaseSpecific || f.needsLegalHelp === true || (isLegal && trusted.length === 0) || (isLegal && usedStores.size > 0),
          proposals,
          followUps: (Array.isArray(f.followUps) ? f.followUps : [])
            .filter((q): q is string => typeof q === "string" && Boolean(q.trim()))
            .map((q) => clip(q.trim(), 80))
            .slice(0, 3),
        };
        // If the model forgot to list the data it read, list what it was given.
        if (!answer.usedData.length && usedStores.size) answer.usedData = [...usedStores];
        return NextResponse.json({ answer });
      }

      if (!("tool" in turn)) continue;
      const args = turn.args ?? {};
      let result: unknown;
      switch (turn.tool) {
        case "getUserData": {
          const store = args.store as Store;
          if (!STORES.includes(store)) {
            result = { error: "unknown store" };
            break;
          }
          if (!(store in data)) {
            // Ask the device for just this slice, then the request starts over with it.
            return NextResponse.json({ needData: [{ store, filters: args.filters ?? undefined }] });
          }
          usedStores.add(store);
          result = filterData(store, data[store], (args.filters ?? {}) as DataFilters);
          break;
        }
        case "getItem": {
          const d = getItemDetails(String(args.id), locale);
          if (d) {
            d.links.forEach((l) => allow(l.url, l.title));
            d.howTo.forEach((s) => s.link && allow(s.link, s.step));
          }
          result = d ?? { error: "no such item" };
          break;
        }
        case "searchTrustedSources": {
          const found = await searchTrustedSources(clip(args.query, 200), locale);
          found.forEach((r) => allow(r.url, r.title));
          result = found.map(({ title, url, excerpt, sourceType: type }) => ({ title, url, type, excerpt }));
          break;
        }
        case "markItemDone":
        case "markItemNotDone": {
          const id = String(args.id);
          if (getItem(id)) {
            proposals.push({ kind: turn.tool === "markItemDone" ? "markDone" : "markNotDone", itemId: id });
            result = { proposed: true, note: "Waiting for the person to confirm. Nothing is saved yet." };
          } else result = { error: "no such item" };
          break;
        }
        case "addDate": {
          if (validDate(args.date) && typeof args.label === "string" && args.label.trim()) {
            proposals.push({ kind: "addDate", label: clip(args.label, 80), date: args.date, docType: clip(args.docType, 30) || "other" });
            result = { proposed: true, note: "Waiting for the person to confirm. Nothing is saved yet." };
          } else result = { error: "need a label and a YYYY-MM-DD date" };
          break;
        }
        case "findLegalHelp": {
          const { listings } = await findHelp(clip(args.city, 60) || "Houston, TX");
          const lang = clip(args.language, 30).toLowerCase();
          result = {
            page: "/legal/help",
            listings: listings
              .filter((l) => !lang || lang === "english" || l.languages?.some((x) => x.toLowerCase().includes(lang)))
              .slice(0, 5)
              .map(({ name, type, cost, phone, address, languages }) => ({ name, type, cost, phone, address, languages })),
          };
          break;
        }
        case "findEvents": {
          const extra = [args.culture, args.language, args.faith].filter((x): x is string => typeof x === "string" && Boolean(x.trim())).map((x) => `${clip(x, 40)} community`);
          const range = args.dateRange as { from?: string; to?: string } | undefined;
          const { events } = await findEvents(clip(args.city, 60) || "Houston, TX", locale, extra);
          result = {
            page: "/social",
            events: events
              .filter((e) => !range || !e.startDate || !validDate(e.startDate) || ((!range.from || e.startDate >= range.from) && (!range.to || e.startDate <= range.to)))
              .slice(0, 6)
              .map(({ title, when, location }) => ({ title, when, location })),
          };
          break;
        }
        case "openLink": {
          const url = String(args.url ?? "");
          if (isTrusted(url)) {
            allow(url, String(args.title ?? url));
            result = { ok: true };
          } else result = { error: "not a trusted link; it will not be shown" };
          break;
        }
        default:
          result = { error: "unknown tool" };
      }
      steps.push({ tool: turn.tool, args, result });
    }
    throw new Error("no final answer");
  } catch (err) {
    // Never log the message or the person's data.
    console.error("[assistant] AI unavailable, giving a limited answer:", err instanceof Error ? err.message.slice(0, 300) : "error");
    try {
      return NextResponse.json({ answer: await limitedAnswer({ locale, legal, isCaseSpecific, trusted, data }) });
    } catch {
      return NextResponse.json({ error: "failed" }, { status: 502 });
    }
  }
}

/**
 * An answer without the AI (quota used up, provider down): the person's own data that was
 * sent for this question, and quoted trusted sources for legal topics. Marked as limited.
 */
async function limitedAnswer({
  locale,
  legal,
  isCaseSpecific,
  trusted,
  data,
}: {
  locale: Locale;
  legal: boolean;
  isCaseSpecific: boolean;
  trusted: TrustedResult[];
  data: Partial<Record<Store, unknown>>;
}): Promise<AssistantAnswer> {
  const t = await getTranslations({ locale, namespace: "assistant" });
  const tItems = await getTranslations({ locale, namespace: "checklist.items" });
  const date = (iso: string) =>
    new Intl.DateTimeFormat(intlTag(locale), { dateStyle: "long" }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));
  const parts: string[] = [];
  const used: Store[] = [];
  const links: ChatLink[] = [];

  if (legal) {
    if (trusted.length) {
      parts.push(t("limitedSources"), trusted[0].excerpt.split(/\n\s*\n/).slice(0, 2).join("\n\n"));
      for (const r of trusted.slice(0, 2)) links.push({ type: "external", url: r.url, title: r.title, sourceType: r.sourceType });
    } else {
      parts.push(t("limitedNoSource"));
    }
  }

  const dates = Array.isArray(data.dates) ? (data.dates as { label: string; date: string; daysFromToday?: number }[]) : null;
  if (dates) {
    used.push("dates");
    parts.push(
      dates.length
        ? `${t("fromDates")}\n${dates.slice(0, 6).map((d) => `- **${d.label}**: ${date(d.date)}${typeof d.daysFromToday === "number" && d.daysFromToday >= 0 ? ` (${t("inDays", { count: d.daysFromToday })})` : ""}`).join("\n")}`
        : t("noDates")
    );
  }
  const checklist = Array.isArray(data.checklist) ? (data.checklist as { id: string; done: boolean }[]) : null;
  if (checklist) {
    used.push("checklist");
    const open = checklist.filter((i) => !i.done && getItem(i.id));
    parts.push(
      `${t("fromChecklist", { done: checklist.length - open.length, total: checklist.length })}${
        open.length ? `\n${open.slice(0, 6).map((i) => `- [${tItems(`${i.id}.title`)}](/legal/checklist/${i.id})`).join("\n")}` : ""
      }`
    );
    links.push({ type: "internal", url: "/legal/checklist", title: t("openChecklist") });
  }
  const plan = Array.isArray(data.plan) ? (data.plan as { title: string; done: boolean }[]) : null;
  if (plan) {
    used.push("plan");
    const open = plan.filter((s) => !s.done);
    parts.push(open.length ? `${t("fromPlan")}\n${open.slice(0, 4).map((s) => `- ${s.title}`).join("\n")}` : t("planDone"));
  }
  const profile = data.profile as { city?: string; languages?: string[]; monthsInUSAtSignup?: number } | null | undefined;
  if (profile) {
    used.push("profile");
    parts.push(t("fromProfile", { city: profile.city ?? "-", languages: (profile.languages ?? []).join(", ") || "-" }));
  }
  const prep = data.prepSummaries as { appointmentPrep?: { questions?: string[] } | null; savedQuestions?: { question: string }[] } | undefined;
  if (prep) {
    used.push("prepSummaries");
    const qs = [...(prep.appointmentPrep?.questions ?? []), ...(prep.savedQuestions ?? []).map((q) => q.question)].slice(0, 6);
    parts.push(qs.length ? `${t("fromQuestions")}\n${qs.map((q) => `- ${q}`).join("\n")}` : t("noQuestions"));
  }

  if (!parts.length) parts.push(t("limitedGeneric"));
  return {
    text: maskDeep(parts.join("\n\n")),
    links,
    usedData: used,
    isLegal: legal,
    helpCard: isCaseSpecific || (legal && !trusted.length),
    proposals: [],
    followUps: [t("s4"), t("s3"), t("s1")],
    limited: true,
  };
}
