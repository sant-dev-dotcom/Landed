import "server-only";

// Meta Muse Spark through the Meta Model API's Responses endpoint (OpenAI-compatible): plain
// answers (museText), and answers with built-in web search (museWebSearch). The search runs on
// Meta's side and is streamed so each search can be shown while it happens.

const BASE = (process.env.META_MODEL_API_BASE || "https://api.meta.ai/v1").replace(/\/$/, "");
const MODEL = process.env.MUSE_SEARCH_MODEL || "muse-spark-1.3";

export const isMuseConfigured = () => Boolean(process.env.MUSE_API_KEY);

/** A plain answer, no web search. `image` is a data: URL (e.g. a photo of a flyer) to read along with the text. */
export async function museText(instructions: string, input: string, { image, timeoutMs = 20_000 }: { image?: string; timeoutMs?: number } = {}): Promise<string> {
  const content = image
    ? [{ role: "user", content: [{ type: "input_text", text: input }, { type: "input_image", image_url: image }] }]
    : input;
  const res = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MUSE_API_KEY}` },
    body: JSON.stringify({ model: MODEL, instructions, input: content, reasoning: { effort: "low" } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Muse HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { output?: OutputItem[] };
  return result(body.output ?? []).text;
}

interface OutputItem {
  id?: string;
  type: string;
  content?: { type: string; text?: string; annotations?: { type: string; url?: string }[] }[];
  action?: { type?: string; query?: string; url?: string; sources?: { url?: string }[] };
}

export interface MuseSearchResult {
  /** The final answer. */
  text: string;
  /** Every page the searches returned or the answer cited. The answer doesn't always cite. */
  sources: string[];
}

/** What the model is doing, as it happens. */
export type MuseStep =
  | { kind: "search"; id: string; query: string }
  | { kind: "searched"; id: string; query: string; results: number }
  | { kind: "read"; id: string; url: string };

function result(output: OutputItem[]): MuseSearchResult {
  // The model thinks and searches in several rounds; each round ends in a message.
  // The last message is the answer.
  const texts = output.filter((o) => o.type === "message").flatMap((m) => m.content ?? []).filter((p) => p.type === "output_text");
  const cited = texts.flatMap((p) => p.annotations ?? []).filter((a) => a.type === "url_citation" && a.url).map((a) => a.url!);
  // Pages the searches returned, and pages the model opened to read.
  const searched = output
    .filter((o) => o.type === "web_search_call")
    .flatMap((o) => [...(o.action?.sources ?? []).map((s) => s.url), o.action?.type === "open_page" ? o.action.url : undefined])
    .filter((u): u is string => Boolean(u));
  const text = texts.at(-1)?.text ?? "";
  if (!text) throw new Error("Muse returned no answer");
  return { text, sources: [...new Set([...cited, ...searched])] };
}

export async function museWebSearch(
  instructions: string,
  input: string,
  {
    // A few low-effort searches answer in about 10 seconds; unlimited ones can take 45+.
    maxSearches = 6,
    effort = "low",
    timeoutMs = 50_000,
    onStep,
  }: { maxSearches?: number; effort?: "low" | "medium"; timeoutMs?: number; onStep?: (step: MuseStep) => void } = {}
): Promise<MuseSearchResult> {
  const res = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MUSE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      reasoning: { effort },
      max_tool_calls: maxSearches,
      stream: true,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok || !res.body) throw new Error(`Muse HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  // Server-sent events: blocks separated by a blank line, each with a "data: {json}" line.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output: OutputItem[] | null = null;
  const handle = (ev: { type?: string; item?: OutputItem; response?: { output?: OutputItem[]; error?: unknown } }) => {
    const item = ev.item;
    if (item?.type === "web_search_call" && item.id && onStep) {
      const a = item.action ?? {};
      if (ev.type === "response.output_item.added" && a.type === "search" && a.query) onStep({ kind: "search", id: item.id, query: a.query });
      if (ev.type === "response.output_item.done" && a.type === "search" && a.query)
        onStep({ kind: "searched", id: item.id, query: a.query, results: a.sources?.length ?? 0 });
      if (ev.type === "response.output_item.done" && a.type === "open_page" && a.url) onStep({ kind: "read", id: item.id, url: a.url });
    }
    if (ev.type === "response.completed") output = ev.response?.output ?? [];
    if (ev.type === "response.failed" || ev.type === "error") throw new Error(`Muse stream: ${JSON.stringify(ev.response?.error ?? ev).slice(0, 200)}`);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      try {
        handle(JSON.parse(data));
      } catch (err) {
        if (err instanceof SyntaxError) continue; // a malformed block: skip it
        throw err;
      }
    }
  }
  if (!output) throw new Error("Muse stream ended without an answer");
  return result(output);
}
