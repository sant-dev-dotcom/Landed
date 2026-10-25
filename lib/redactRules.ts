// Finds private details in a document's text so they can be covered with black bars on the
// device before the image is sent anywhere. Works on OCR output (lines of words with boxes).
// No imports: shared by the app and scripts/test-redact.ts.

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrWord {
  text: string;
  bbox: Box;
}
export interface OcrLine {
  words: OcrWord[];
}

export type RedactKind = "aNumber" | "receipt" | "ssn" | "phone" | "email" | "account" | "name" | "birth" | "address" | "id";

export interface Finding {
  kind: RedactKind;
  box: Box;
}

// Patterns that are private wherever they appear.
const PATTERNS: [RedactKind, RegExp][] = [
  ["aNumber", /\bA[-\s#:.]*\d{3}[-\s]?\d{3}[-\s]?\d{2,3}\b/gi],
  ["receipt", /\b(IOE|EAC|WAC|LIN|SRC|NBC|MSC|YSC|ZSF|ZHN|ZNY)[-\s]?\d{10}\b/gi],
  ["ssn", /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g],
  ["email", /\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g],
  ["phone", /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g],
  // Long digit runs: account, case, policy and card numbers. Dates are excluded below.
  ["account", /\b\d(?:[\d -]{6,}\d)\b/g],
];

// "Label: value" where the value is private. The value runs to the next label or the end of the line.
const LABELS: [RedactKind, RegExp][] = [
  [
    "name",
    /\b(applicant|beneficiary|petitioner|respondent|resident|tenant|recipient|patient|employee|client|full name|name|solicitante|beneficiari[oa]|peticionari[oa]|inquilin[oa]|residente|nombre)\s*:/gi,
  ],
  ["birth", /\b(date of birth|birth ?date|d\.?o\.?b\.?|fecha de nacimiento)\s*:/gi],
  ["address", /\b(mailing address|home address|address|dirección|direccion|domicilio)\s*:/gi],
  [
    "id",
    /\b(passport|ssn|social security|itin|alien|file|account|policy|member|case|card|license|licencia|pasaporte|cuenta)\s*(no\.?|number|#|id|número|numero)?\s*:/gi,
  ],
  ["phone", /\b(phone|tel|telephone|mobile|cell|teléfono|telefono|celular)\s*(no\.?|number)?\s*:/gi],
  ["email", /\b(e-?mail|correo)\s*:/gi],
];

/**
 * Where the next "Label:" starts after `from` (or the end of the line). The label is the word
 * right before a colon, plus the word before it when that's a short suffix ("File No.:").
 */
function nextLabelStart(text: string, from: number) {
  for (let c = text.indexOf(":", from); c !== -1; c = text.indexOf(":", c + 1)) {
    if (c + 1 < text.length && text[c + 1] !== " ") continue; // times like 8:30
    let start = text.lastIndexOf(" ", c - 1) + 1;
    if (/^(no\.?|number|#|id|date|type)$/i.test(text.slice(start, c))) start = text.lastIndexOf(" ", start - 2) + 1;
    if (start > from) return start;
  }
  return text.length;
}

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/;
const digits = (s: string) => (s.match(/\d/g) ?? []).length;

function union(boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

/**
 * The private details in a page. `names` are the person's own names (from their profile),
 * covered wherever they appear.
 */
export function findSensitive(lines: OcrLine[], names: string[] = []): Finding[] {
  const findings: Finding[] = [];
  const nameWords = new Set(names.flatMap((n) => n.toLowerCase().split(/\s+/)).filter((w) => w.length >= 3));

  for (const line of lines) {
    const words = line.words.filter((w) => w.text.trim());
    if (!words.length) continue;
    // Line text with each word's character range, so matches map back to word boxes.
    let text = "";
    const ranges = words.map((w) => {
      if (text) text += " ";
      const start = text.length;
      text += w.text;
      return [start, text.length] as const;
    });
    const covered = new Set<number>();
    const cover = (kind: RedactKind, start: number, end: number) => {
      const hit = words.map((_, i) => i).filter((i) => ranges[i][0] < end && ranges[i][1] > start && !covered.has(i));
      if (!hit.length) return;
      hit.forEach((i) => covered.add(i));
      // Contiguous words become one bar.
      let run: number[] = [];
      const flush = () => {
        if (run.length) findings.push({ kind, box: union(run.map((i) => words[i].bbox)) });
        run = [];
      };
      for (const i of hit) {
        if (run.length && i !== run[run.length - 1] + 1) flush();
        run.push(i);
      }
      flush();
    };

    for (const [kind, re] of LABELS) {
      for (const m of text.matchAll(re)) {
        const start = m.index! + m[0].length;
        // Names end at a comma ("Name: Maria Ejemplo, Houston").
        const comma = kind === "name" ? text.indexOf(",", start) : -1;
        const end = Math.min(nextLabelStart(text, start), comma > start ? comma : text.length);
        if (text.slice(start, end).trim()) cover(kind, start, end);
      }
    }
    for (const [kind, re] of PATTERNS) {
      for (const m of text.matchAll(re)) {
        if (kind === "account" && (digits(m[0]) < 8 || DATE_LIKE.test(m[0].trim()))) continue;
        cover(kind, m.index!, m.index! + m[0].length);
      }
    }
    // "Dear Maria," greetings.
    for (const m of text.matchAll(/\b(dear|estimad[oa]|querid[oa])\s+/gi)) {
      const start = m.index! + m[0].length;
      const end = text.indexOf(",", start);
      if (end > start && end - start < 40) cover("name", start, end);
    }
    // The person's own name anywhere.
    words.forEach((w, i) => {
      const clean = w.text.toLowerCase().replace(/[^\p{L}]/gu, "");
      if (nameWords.has(clean)) cover("name", ranges[i][0], ranges[i][1]);
    });
  }
  return findings;
}

/** Grow a bar a little so letters don't peek out from the edges. */
export function pad(box: Box, imageW: number, imageH: number): Box {
  const h = box.y1 - box.y0;
  const p = Math.max(3, Math.round(h * 0.25));
  return { x0: Math.max(0, box.x0 - p), y0: Math.max(0, box.y0 - p), x1: Math.min(imageW, box.x1 + p), y1: Math.min(imageH, box.y1 + p) };
}
