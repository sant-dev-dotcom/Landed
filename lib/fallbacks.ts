import "server-only";
import { isoFromToday, sampleDates, type SampleId } from "./demoLetters";
import type { EventListing, HelpListing, JobListing, Locale, PlanStep, PrepSummary, Profile, ScanResult, TrackedDate } from "./types";

// Deterministic content used when no LLM / SerpApi key is configured or a call
// fails, so the demo always completes. Responses are flagged `sample: true`.

/* ---------------- Plan ---------------- */

export function planFallback(p: Profile): PlanStep[] {
  const es = p.locale === "es";
  const city = p.city.split(",")[0];
  const steps: Omit<PlanStep, "id" | "done">[] = [
    {
      category: "daily",
      dueInDays: 7,
      title: es ? "Consiga un plan de teléfono" : "Get a phone plan",
      why: es
        ? "Un número de EE. UU. le ayuda a recibir citas, ofertas de trabajo y avisos importantes. Los planes prepagados no piden historial de crédito."
        : "A US number helps you get appointments, job offers and important notices. Prepaid plans don't need a credit history.",
    },
    {
      category: "legal",
      dueInDays: 14,
      title: es ? "Guarde sus documentos importantes en un solo lugar" : "Keep your important papers in one place",
      why: es
        ? "Guarde pasaporte, I-94 y cartas en una carpeta. Anote las fechas en Landed para no perderlas."
        : "Keep your passport, I-94 and letters in one folder. Add their dates to Landed so you don't miss them.",
      sourceUrl: "https://i94.cbp.dhs.gov/",
    },
    {
      category: "legal",
      dueInDays: 21,
      title: es ? `Encuentre ayuda legal gratis en ${city}` : `Find free legal help in ${city}`,
      why: es
        ? "Una organización sin fines de lucro puede revisar su situación. Solo abogados y representantes acreditados pueden darle consejo legal."
        : "A nonprofit can look at your situation. Only lawyers and accredited representatives can give you legal advice.",
      sourceUrl: "https://www.immigrationlawhelp.org/",
    },
    {
      category: "money",
      dueInDays: 30,
      title: es ? "Aprenda cómo abrir una cuenta de banco" : "Learn how to open a bank account",
      why: es
        ? "Es más seguro que guardar efectivo. Algunos bancos y cooperativas aceptan pasaporte o matrícula consular."
        : "It's safer than keeping cash. Some banks and credit unions accept a passport or consular ID.",
      sourceUrl: "https://www.consumerfinance.gov/consumer-tools/bank-accounts/",
    },
    {
      category: "health",
      dueInDays: 30,
      title: es ? "Ubique un centro de salud comunitario" : "Find a community health center",
      why: es
        ? "Cobran según lo que usted puede pagar y atienden con o sin seguro médico."
        : "They charge based on what you can pay and see patients with or without insurance.",
      sourceUrl: "https://findahealthcenter.hrsa.gov/",
    },
    {
      category: "daily",
      dueInDays: 45,
      title: es ? "Inscríbase en clases de inglés gratis" : "Sign up for free English classes",
      why: es
        ? "Bibliotecas y colegios comunitarios ofrecen clases de día, de noche y en línea."
        : "Libraries and community colleges offer day, evening and online classes.",
      sourceUrl: "https://usahello.org/education/learn-english/",
    },
    {
      category: "social",
      dueInDays: 45,
      title: es ? "Conozca a alguien que ya pasó por esto" : "Meet one person who's been through it",
      why: es
        ? "Alguien de su comunidad puede compartir lo que aprendió. Vea eventos y personas en Comunidad."
        : "Someone from your community can share what they learned. See events and people in Community.",
    },
    {
      category: "jobs",
      dueInDays: 60,
      title: p.workBackground
        ? es
          ? `Aprenda cómo se licencia su trabajo (${p.workBackground}) en EE. UU.`
          : `Learn how your work (${p.workBackground}) is licensed in the US`
        : es
          ? "Aprenda sus derechos en el trabajo"
          : "Learn your rights at work",
      why: es
        ? "Muchas profesiones necesitan una licencia estatal. Saber los pasos le ayuda a planear."
        : "Many professions need a state license. Knowing the steps helps you plan.",
      sourceUrl: p.workBackground ? undefined : "https://www.dol.gov/agencies/whd/minimum-wage",
    },
  ];
  if (p.hasChildren) {
    steps.splice(5, 0, {
      category: "daily",
      dueInDays: 21,
      title: es ? "Inscriba a sus hijos en la escuela" : "Enroll your children in school",
      why: es
        ? "En EE. UU., las escuelas públicas son gratis para todos los niños, sin importar su estatus migratorio."
        : "In the US, public schools are free for all children, regardless of immigration status.",
      sourceUrl: "https://www.ed.gov/",
    });
  }
  return steps.map((s, i) => ({ ...s, id: `step-${i + 1}`, done: false }));
}

/* ---------------- Scan ---------------- */

export function scanFallback(id: SampleId, locale: Locale): ScanResult {
  const es = locale === "es";
  const d = sampleDates(id);
  if (id === "receipt") {
    return {
      documentKind: es ? "Aviso de recibo de USCIS" : "USCIS receipt notice",
      summary: es
        ? "Esta carta dice que USCIS recibió una solicitud de permiso de trabajo (I-765) y su pago. Solo confirma que la recibieron; no aprueba nada todavía. Guárdela: tiene el número de recibo para revisar el estado del caso."
        : "This letter says USCIS received an application for a work permit (I-765) and its fee. It only confirms they got it; it does not approve anything yet. Keep it: it has the receipt number to check the case status.",
      dates: [
        { label: es ? "USCIS recibió la solicitud" : "USCIS received the application", date: d.received },
        { label: es ? "Fecha del aviso" : "Notice date", date: d.notice },
      ],
      terms: [
        { term: es ? "Aviso de acción (I-797)" : "Notice of Action (I-797)", meaning: es ? "Una carta oficial de USCIS sobre un caso." : "An official USCIS letter about a case." },
        { term: es ? "Número de recibo (•••2345)" : "Receipt number (•••2345)", meaning: es ? "El código para revisar el caso en uscis.gov. Lo mostramos oculto por privacidad." : "The code used to check the case on uscis.gov. We hide most of it for privacy." },
        { term: "I-765", meaning: es ? "El formulario para pedir permiso de trabajo (EAD)." : "The form used to ask for a work permit (EAD)." },
      ],
      riskLevel: "low",
      suggestedNextStep: es
        ? "Guarde esta carta. Puede revisar el estado del caso en uscis.gov con el número de recibo."
        : "Keep this letter. You can check the case status on uscis.gov with the receipt number.",
    };
  }
  if (id === "hearing") {
    return {
      documentKind: es ? "Aviso de audiencia en la corte de inmigración" : "Immigration court hearing notice",
      summary: es
        ? "Esta carta es de la corte de inmigración. Dice que hay una audiencia programada con un juez en Houston, con fecha, hora y dirección. Faltar a la audiencia puede tener consecuencias serias. La carta también dice que la persona puede tener un abogado, pero debe buscarlo por su cuenta."
        : "This letter is from the immigration court. It says a hearing with a judge is scheduled in Houston, with a date, time and address. Missing the hearing can have serious consequences. The letter also says the person may have a lawyer, but must find one on their own.",
      dates: [
        { label: es ? "Audiencia en la corte (8:30 AM)" : "Court hearing (8:30 AM)", date: d.hearing },
        { label: es ? "Fecha del aviso" : "Notice date", date: d.notice },
      ],
      terms: [
        { term: es ? "Procedimientos de deportación (removal)" : "Removal proceedings", meaning: es ? "Un caso en la corte donde un juez decide si una persona puede quedarse en EE. UU." : "A court case where a judge decides if a person can stay in the US." },
        { term: es ? "Audiencia master" : "Master hearing", meaning: es ? "Una primera audiencia corta, normalmente con muchas personas, para organizar el caso." : "A short first hearing, usually with many people, to organize the case." },
        { term: es ? "Sin costo para el gobierno" : "At no expense to the Government", meaning: es ? "Puede tener abogado, pero el gobierno no lo paga. Hay ayuda gratis." : "You can have a lawyer, but the government won't pay. Free help exists." },
        { term: es ? "Número A (•••3456)" : "A-Number (•••3456)", meaning: es ? "El número de expediente de inmigración. Lo mostramos oculto por privacidad." : "The immigration file number. We hide most of it for privacy." },
      ],
      riskLevel: "high",
      riskReason: es
        ? "Menciona una audiencia en la corte y procedimientos de deportación. Hable con ayuda legal antes de la fecha."
        : "It mentions a court hearing and removal proceedings. Talk to legal help before the date.",
      suggestedNextStep: es
        ? "Hable con ayuda legal gratis antes de la fecha de la audiencia. Lleve esta carta."
        : "Talk to free legal help before the hearing date. Bring this letter.",
    };
  }
  return {
    documentKind: es ? "Aviso de renovación de contrato de renta" : "Lease renewal notice",
    summary: es
      ? "Su apartamento ofrece un contrato nuevo de 12 meses con una renta más alta ($1,250 al mes). Tiene que firmar o avisar por escrito que se muda antes de la fecha límite. Si no responde, la renta sube a $1,400 mes a mes."
      : "Your apartment is offering a new 12-month lease at a higher rent ($1,250 a month). You need to sign it or give written notice that you are moving out by the deadline. If you don't respond, rent goes up to $1,400 month-to-month.",
    dates: [
      { label: es ? "Responder antes de" : "Respond by", date: d.respondBy },
      { label: es ? "Termina el contrato actual" : "Current lease ends", date: d.leaseEnds },
    ],
    terms: [
      { term: es ? "Renovación (renewal)" : "Renewal", meaning: es ? "Firmar un contrato nuevo para quedarse." : "Signing a new lease to stay." },
      { term: es ? "Aviso por escrito" : "Written notice", meaning: es ? "Una carta o correo firmado diciendo lo que decidió. Guarde una copia." : "A signed letter or email saying what you decided. Keep a copy." },
      { term: es ? "Mes a mes" : "Month-to-month", meaning: es ? "Sin contrato largo; la renta y las reglas pueden cambiar con aviso." : "No long lease; rent and rules can change with notice." },
    ],
    riskLevel: "medium",
    riskReason: es ? "Pide una respuesta antes de una fecha." : "It asks for a response by a deadline.",
    suggestedNextStep: es
      ? "Decida antes de la fecha límite y responda por escrito. Si tiene dudas sobre el contrato, TexasLawHelp.org tiene información gratis."
      : "Decide before the deadline and answer in writing. If you have questions about the lease, TexasLawHelp.org has free information.",
  };
}

/* ---------------- Ask ---------------- */

export function caseSpecificIntro(locale: Locale) {
  return locale === "es"
    ? "No puedo responder sobre su caso específico, porque la respuesta depende de su estatus, su historial y cualquier caso pendiente. Esto es lo que dicen las fuentes oficiales en general:"
    : "I can't answer for your specific case, because the answer depends on your status, history and any pending cases. Here is what official sources say in general:";
}

export function dontKnow(locale: Locale) {
  return locale === "es"
    ? "No encontré esto en mis fuentes confiables, así que no quiero adivinar. Puede revisar el sitio oficial (los sitios del gobierno terminan en .gov) o hablar con ayuda legal gratis."
    : "I couldn't find this in my trusted sources, so I don't want to guess. You can check the official website (government sites end in .gov) or talk to free legal help.";
}

/* ---------------- Help ---------------- */

type Seed = Omit<HelpListing, "cost"> & { cost: HelpListing["cost"] };
const HELP_SEEDS: Record<string, Seed[]> = {
  houston: [
    { name: "Catholic Charities of the Archdiocese of Galveston-Houston", type: "nonprofit", address: "Houston, TX", website: "https://www.catholiccharities.org/", languages: ["English", "Spanish"], cost: "low" },
    { name: "BakerRipley Immigration Legal Services", type: "nonprofit", address: "Houston, TX", website: "https://www.bakerripley.org/", languages: ["English", "Spanish"], cost: "low" },
    { name: "YMCA International Services", type: "nonprofit", address: "Houston, TX", website: "https://www.ymcahouston.org/", languages: ["English", "Spanish"], cost: "free" },
    { name: "Tahirih Justice Center – Houston", type: "nonprofit", address: "Houston, TX", website: "https://www.tahirih.org/", languages: ["English", "Spanish"], cost: "free" },
    { name: "University of Houston Law Center – Immigration Clinic", type: "clinic", address: "Houston, TX", website: "https://www.law.uh.edu/clinic/", cost: "free" },
    { name: "Houston Immigration Legal Services Collaborative (directory)", type: "nonprofit", address: "Houston, TX", website: "https://www.houstonimmigration.org/", languages: ["English", "Spanish"], cost: "free" },
  ],
  dallas: [
    { name: "Catholic Charities Dallas – Immigration Legal Services", type: "nonprofit", address: "Dallas, TX", website: "https://www.ccdallas.org/", languages: ["English", "Spanish"], cost: "low" },
    { name: "Human Rights Initiative of North Texas", type: "nonprofit", address: "Dallas, TX", website: "https://www.hrionline.org/", languages: ["English", "Spanish"], cost: "free" },
    { name: "RAICES – Dallas", type: "nonprofit", address: "Dallas, TX", website: "https://www.raicestexas.org/", languages: ["English", "Spanish"], cost: "free" },
    { name: "SMU Dedman School of Law – Legal Clinics", type: "clinic", address: "Dallas, TX", website: "https://www.smu.edu/law", cost: "free" },
  ],
  austin: [
    { name: "American Gateways", type: "nonprofit", address: "Austin, TX", website: "https://www.americangateways.org/", languages: ["English", "Spanish"], cost: "low" },
    { name: "Catholic Charities of Central Texas", type: "nonprofit", address: "Austin, TX", website: "https://www.ccctx.org/", languages: ["English", "Spanish"], cost: "low" },
    { name: "RAICES – Austin", type: "nonprofit", address: "Austin, TX", website: "https://www.raicestexas.org/", languages: ["English", "Spanish"], cost: "free" },
    { name: "UT Law – Immigration Clinic", type: "clinic", address: "Austin, TX", website: "https://law.utexas.edu/clinics/", cost: "free" },
  ],
};

export function helpFallback(city: string): HelpListing[] {
  const key = city.split(",")[0].trim().toLowerCase();
  return HELP_SEEDS[key] ?? [];
}

/* ---------------- Events ---------------- */

export function eventsFallback(city: string, locale: Locale): EventListing[] {
  const c = city.split(",")[0];
  const es = locale === "es";
  return [
    { title: es ? "Grupo de conversación en inglés (gratis)" : "Free English Conversation Group", startDate: isoFromToday(3), location: es ? `Biblioteca pública, ${c}` : `Public Library, ${c}`, description: es ? "Practique inglés en un ambiente relajado. Todos los niveles." : "Practice English in a relaxed group. All levels welcome." },
    { title: es ? "Feria de empleo comunitaria" : "Community Job Fair", startDate: isoFromToday(9), location: es ? `Centro comunitario, ${c}` : `Community Center, ${c}` },
    { title: es ? "Taller: Conozca sus derechos como inquilino" : "Workshop: Know Your Rights as a Tenant", startDate: isoFromToday(12), location: c },
    { title: es ? "Noche de bienvenida para familias recién llegadas" : "Welcome Night for Newcomer Families", startDate: isoFromToday(17), location: c },
  ];
}

/* ---------------- Jobs ---------------- */

export function jobsFallback(q: string, city: string): JobListing[] {
  const c = city.split(",")[0];
  const raw = q.trim() || "Patient Care Technician";
  const role = raw.replace(/\b\w/g, (c) => c.toUpperCase());
  return [
    { title: role, company: "Sample Health System", location: `${c}, TX`, via: "Sample" },
    { title: `${role} (Bilingual)`, company: "Sample Community Clinic", location: `${c}, TX`, via: "Sample" },
    { title: "Certified Nursing Assistant (CNA)", company: "Sample Care Center", location: `${c}, TX`, via: "Sample" },
    { title: "Medical Interpreter – Spanish", company: "Sample Language Services", location: `${c}, TX`, via: "Sample" },
  ];
}

/* ---------------- Credential ---------------- */

const BOARDS: { match: RegExp; name: string; url: string; licensed: boolean }[] = [
  { match: /nurs|enfermer/i, name: "Texas Board of Nursing", url: "https://www.bon.texas.gov/", licensed: true },
  { match: /teach|maestr|profesor|docente/i, name: "Texas Education Agency (educator certification)", url: "https://tea.texas.gov/texas-educators/certification", licensed: true },
  { match: /engineer|ingenier/i, name: "Texas Board of Professional Engineers and Land Surveyors", url: "https://pels.texas.gov/", licensed: true },
  { match: /account|contad/i, name: "Texas State Board of Public Accountancy", url: "https://www.tsbpa.texas.gov/", licensed: true },
  { match: /doctor|physician|m[eé]dic/i, name: "Texas Medical Board", url: "https://www.tmb.state.tx.us/", licensed: true },
];

export function credentialFallback(work: string, city: string, locale: Locale) {
  const es = locale === "es";
  const state = /,\s*TX/i.test(city) || !city.includes(",") ? "Texas" : city.split(",")[1].trim();
  const board = state === "Texas" ? BOARDS.find((b) => b.match.test(work)) : undefined;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${state} licensing board ${work}`)}`;
  if (board) {
    return {
      overview: es
        ? `En EE. UU., ${work.toLowerCase()} normalmente es una profesión con licencia. Las licencias las da cada estado, no el gobierno federal. En ${state}, la entidad a cargo es ${board.name}. Muchas veces piden revisar sus estudios del extranjero, un examen y prueba de inglés. Los pasos exactos dependen de su caso; consulte directamente con la junta.`
        : `In the US, ${work.toLowerCase()} is usually a licensed profession. Licenses are given by each state, not the federal government. In ${state}, this is handled by the ${board.name}. They often ask for a review of your foreign education, an exam, and proof of English. The exact steps depend on your situation, so check with the board directly.`,
      boardName: board.name,
      boardUrl: board.url,
    };
  }
  return {
    overview: es
      ? `En EE. UU., algunas profesiones necesitan licencia estatal y otras no. Para ${work.toLowerCase()}, busque si ${state} tiene una junta de licencias. Si no necesita licencia, certificados voluntarios pueden ayudarle a encontrar trabajo.`
      : `In the US, some professions need a state license and others don't. For ${work.toLowerCase()}, check whether ${state} has a licensing board. If no license is needed, voluntary certifications can still help you get hired.`,
    boardName: undefined,
    boardUrl: searchUrl,
  };
}

/* ---------------- Prep ---------------- */

export function prepFallback(
  dates: Pick<TrackedDate, "label" | "date" | "docType">[],
  questions: string[],
  profile: { city?: string; originCountry?: string; locale: Locale; name?: string }
): PrepSummary {
  const build = (es: boolean) => {
    const lines: string[] = [];
    lines.push(es ? "# Resumen para mi cita" : "# My Appointment Summary");
    const who = [profile.name, profile.originCountry && (es ? `de ${profile.originCountry}` : `from ${profile.originCountry}`), profile.city && (es ? `vive en ${profile.city}` : `living in ${profile.city}`)]
      .filter(Boolean)
      .join(", ");
    if (who) lines.push(who + ".");
    lines.push("", es ? "## Mis documentos y fechas" : "## My documents and dates");
    const fmt = (iso: string) => {
      const [y, m, day] = iso.split("-").map(Number);
      return y ? new Date(y, m - 1, day).toLocaleDateString(es ? "es-US" : "en-US", { dateStyle: "long" }) : iso;
    };
    if (dates.length) dates.forEach((d) => lines.push(`- **${fmt(d.date)}** — ${d.label} (${d.docType})`));
    else lines.push(es ? "- Aún no he guardado fechas." : "- I have not saved any dates yet.");
    lines.push("", es ? "## Mis preguntas" : "## My questions");
    if (questions.length) questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    else lines.push(es ? "- (Sin preguntas escritas)" : "- (No written questions)");
    lines.push("", es ? "## Qué llevar" : "## What to bring");
    (es
      ? ["Pasaporte y cualquier identificación", "Todas las cartas o avisos que ha recibido (USCIS, corte, etc.)", "Su I-94 impreso (i94.cbp.dhs.gov)", "Copias de solicitudes que ya envió", "Una lista de sus direcciones en EE. UU.", "Papel y lápiz para notas"]
      : ["Passport and any ID", "All letters or notices you received (USCIS, court, etc.)", "Your printed I-94 (i94.cbp.dhs.gov)", "Copies of any applications you already sent", "A list of your US addresses", "Paper and pen for notes"]
    ).forEach((x) => lines.push(`- ${x}`));
    return lines.join("\n");
  };
  return { summaryLocale: build(profile.locale === "es"), summaryEnglish: build(false) };
}
