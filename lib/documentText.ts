// The text of a scanned document as it was sent: the words read on the device, minus every
// word under a black bar. This is what can be highlighted on screen and asked about, so
// covered details never reach the chat. No imports beyond types: shared by the app and tests.
import type { Box, OcrLine } from "./redactRules";

export interface DocWord {
  text: string;
  box: Box;
}
/** One line of the document; `null` stands for a covered word (shown as a black bar). */
export type DocLine = (DocWord | null)[];

/** Share of the word's box covered by any bar. */
function coveredShare(word: Box, bars: Box[]) {
  const area = Math.max(1, (word.x1 - word.x0) * (word.y1 - word.y0));
  let covered = 0;
  for (const b of bars) {
    const w = Math.min(word.x1, b.x1) - Math.max(word.x0, b.x0);
    const h = Math.min(word.y1, b.y1) - Math.max(word.y0, b.y0);
    if (w > 0 && h > 0) covered += w * h;
  }
  return covered / area;
}

/** The lines with every covered word (more than a fifth under a bar) taken out. */
export function visibleLines(lines: OcrLine[], bars: Box[]): DocLine[] {
  return lines
    .map((l) =>
      l.words
        .filter((w) => w.text.trim())
        .map((w) => (coveredShare(w.bbox, bars) > 0.2 ? null : { text: w.text, box: w.bbox }))
    )
    .filter((l) => l.length > 0);
}

/** Plain text of the visible document, with "[covered]" where a bar is. */
export function documentText(lines: DocLine[]) {
  return lines
    .map((l) =>
      l
        .map((w) => w?.text ?? "[covered]")
        .join(" ")
        .replace(/(\[covered\] ?)+/g, "[covered] ")
        .trim()
    )
    .join("\n");
}
