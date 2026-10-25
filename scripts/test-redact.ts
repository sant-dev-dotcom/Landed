// Run with: npm run test:redact
// Checks which words the on-device redaction covers, using lines like the ones OCR returns.
import { findSensitive, type OcrLine } from "../lib/redactRules.ts";

// Fake boxes: each word gets its own x-range so covered words can be read back.
function line(text: string, y = 0): OcrLine {
  let x = 0;
  return {
    words: text.split(/\s+/).map((w) => {
      const box = { x0: x, y0: y, x1: x + w.length * 10, y1: y + 20 };
      x += w.length * 10 + 10;
      return { text: w, bbox: box };
    }),
  };
}
function coveredWords(text: string, names: string[] = []) {
  const l = line(text);
  const found = findSensitive([l], names);
  return l.words.filter((w) => found.some((f) => w.bbox.x0 >= f.box.x0 && w.bbox.x1 <= f.box.x1)).map((w) => w.text);
}

const cases: [string, string, string[], string[]?][] = [
  // [description, line, words that must be covered (exactly), names]
  ["receipt number", "Receipt Number: IOE0999912345", ["IOE0999912345"]],
  ["name + A-number", "Applicant: MARIA EJEMPLO   A-Number: A-000-123-456", ["MARIA", "EJEMPLO", "A-000-123-456"]],
  ["respondent + file no.", "Respondent: MARIA EJEMPLO   File No.: A-000-123-456", ["MARIA", "EJEMPLO", "A-000-123-456"]],
  ["resident name, not unit", "Resident: Maria Ejemplo   Unit: 214", ["Maria", "Ejemplo"]],
  ["SSN", "SSN: 123-45-6789", ["123-45-6789"]],
  ["phone + email", "Call 713-555-0142 or write maria.e@example.com", ["713-555-0142", "maria.e@example.com"]],
  ["date of birth", "Date of Birth: 03/14/1990", ["03/14/1990"]],
  ["home address", "Address: 5500 Westheimer Rd Apt 4, Houston, TX 77056", ["5500", "Westheimer", "Rd", "Apt", "4,", "Houston,", "TX", "77056"]],
  // Bars cover whole words, so a word's trailing comma is covered with it.
  ["greeting", "Dear Maria Ejemplo, we received your request.", ["Maria", "Ejemplo,"]],
  ["profile name anywhere", "Thank you, Maria, for your payment.", ["Maria,"], ["Maria"]],
  ["account number", "Account 0012 3456 7890 is past due", ["0012", "3456", "7890"]],
  ["Spanish labels", "Nombre: María Ejemplo   Teléfono: (713) 555-0142", ["María", "Ejemplo", "(713)", "555-0142"]],
  // Must stay readable: they're what the letter is about.
  ["hearing date kept", "December 8, 2026 at 8:30 AM", []],
  ["ISO date kept", "Respond by 2026-11-24 to keep your lease", []],
  ["form name kept", "Case Type: I-765, Application for Employment Authorization", []],
  ["court address kept", "Location: 1234 Sample Avenue, Suite 100, Houston, TX 77002", []],
  ["rent amount kept", "New monthly rent: $1,250.00 (current rent: $1,150.00)", []],
];

let failed = 0;
for (const [name, text, expected, names] of cases) {
  const got = coveredWords(text, names);
  const ok = got.length === expected.length && got.every((w, i) => w === expected[i]);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      line:     ${text}\n      expected: [${expected.join(" ")}]\n      got:      [${got.join(" ")}]`}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
