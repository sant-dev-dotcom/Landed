// Three FAKE sample letters for the demo, clearly marked SAMPLE, with invented
// names and numbers. They are generated as SVG so the dates stay relative to
// today; the client rasterizes them to an image before sending to /api/scan.

export type SampleId = "receipt" | "hearing" | "lease";
export const SAMPLE_IDS: SampleId[] = ["receipt", "hearing", "lease"];

const pad = (n: number) => String(n).padStart(2, "0");

export function isoFromToday(days: number, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function usDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function sampleDates(id: SampleId): Record<string, string> {
  switch (id) {
    case "receipt":
      return { received: isoFromToday(-14), notice: isoFromToday(-10) };
    case "hearing":
      return { notice: isoFromToday(-3), hearing: isoFromToday(45) };
    case "lease":
      return { notice: isoFromToday(-2), respondBy: isoFromToday(30), leaseEnds: isoFromToday(75) };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(lines: { text: string; size?: number; bold?: boolean; gap?: number; color?: string }[], header: string) {
  let y = 170;
  const body = lines
    .map((l) => {
      y += l.gap ?? (l.size ?? 22) * 1.55;
      return `<text x="80" y="${y}" font-size="${l.size ?? 22}" font-weight="${l.bold ? 700 : 400}" fill="${
        l.color ?? "#1a1a1a"
      }">${esc(l.text)}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100" viewBox="0 0 850 1100" font-family="Arial, Helvetica, sans-serif">
<rect width="850" height="1100" fill="#ffffff"/>
<rect x="0" y="0" width="850" height="110" fill="#f1f3f6"/>
<text x="80" y="68" font-size="28" font-weight="700" fill="#22324a">${esc(header)}</text>
<g transform="rotate(-28 425 560)" opacity="0.13"><text x="425" y="600" text-anchor="middle" font-size="150" font-weight="700" fill="#d00000">SAMPLE</text></g>
<rect x="560" y="128" width="210" height="44" rx="6" fill="none" stroke="#d00000" stroke-width="3"/>
<text x="665" y="158" text-anchor="middle" font-size="20" font-weight="700" fill="#d00000">SAMPLE ONLY</text>
${body}
<text x="80" y="1050" font-size="16" fill="#777">FAKE DOCUMENT FOR DEMONSTRATION. Names and numbers are invented. Not an official notice.</text>
</svg>`;
}

export function demoLetterSvg(id: SampleId): string {
  const d = sampleDates(id);
  if (id === "receipt") {
    return page(
      [
        { text: "Department of Homeland Security (SAMPLE)", bold: true },
        { text: "U.S. Citizenship and Immigration Services (SAMPLE)" },
        { text: "NOTICE OF ACTION: RECEIPT NOTICE", size: 26, bold: true, gap: 60 },
        { text: `Receipt Number: IOE0999912345`, gap: 50 },
        { text: `Case Type: I-765, Application for Employment Authorization` },
        { text: `Received Date: ${usDate(d.received)}` },
        { text: `Notice Date: ${usDate(d.notice)}` },
        { text: "Applicant: MARIA EJEMPLO   A-Number: A-000-123-456" },
        { text: "We have received your application and fee. This notice", gap: 55 },
        { text: "only confirms that we received it. It does not grant any" },
        { text: "immigration status or benefit. We will notify you by mail" },
        { text: "if we need more information. Keep this notice for your" },
        { text: "records and use the receipt number to check your case status." },
      ],
      "USCIS — Receipt Notice"
    );
  }
  if (id === "hearing") {
    return page(
      [
        { text: "U.S. Department of Justice (SAMPLE)", bold: true },
        { text: "Executive Office for Immigration Review — Immigration Court" },
        { text: "NOTICE OF HEARING IN REMOVAL PROCEEDINGS", size: 26, bold: true, gap: 60 },
        { text: `Date of Notice: ${usDate(d.notice)}`, gap: 50 },
        { text: "Respondent: MARIA EJEMPLO   File No.: A-000-123-456" },
        { text: "Your case has been scheduled for a MASTER hearing before", gap: 55 },
        { text: "the Immigration Court on:" },
        { text: `${usDate(d.hearing)} at 8:30 AM`, size: 26, bold: true, gap: 50 },
        { text: "Location: 1234 Sample Avenue, Suite 100, Houston, TX 77002", gap: 50 },
        { text: "You may be represented in these proceedings, at no expense", gap: 55 },
        { text: "to the Government, by an attorney or other individual authorized" },
        { text: "to appear. Failure to appear at your hearing except for" },
        { text: "exceptional circumstances may result in an order of removal" },
        { text: "being entered in your absence." },
      ],
      "Immigration Court — Hearing Notice"
    );
  }
  return page(
    [
      { text: "Sunny Oaks Apartments (SAMPLE)", bold: true },
      { text: "100 Example Road, Houston, TX 77036" },
      { text: "LEASE RENEWAL NOTICE", size: 26, bold: true, gap: 60 },
      { text: `Date: ${usDate(d.notice)}`, gap: 50 },
      { text: "Resident: Maria Ejemplo   Unit: 214" },
      { text: `Your current lease ends on ${usDate(d.leaseEnds)}.`, gap: 55 },
      { text: "We would like to offer you a new 12-month lease." },
      { text: "New monthly rent: $1,250.00 (current rent: $1,150.00)", bold: true, gap: 45 },
      { text: `Please sign and return the renewal or give written notice`, gap: 50 },
      { text: `that you will move out by ${usDate(d.respondBy)}.`, bold: true },
      { text: "If we do not hear from you by this date, your lease will" },
      { text: "convert to month-to-month at $1,400.00 per month." },
      { text: "Questions? Visit the leasing office, Mon–Fri 9 AM–6 PM.", gap: 50 },
    ],
    "Lease Renewal Notice"
  );
}
