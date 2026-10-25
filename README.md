# Landed

Helps newcomers to the US understand their letters, track important dates, find trusted legal help, and meet people who have been through it. 23 languages, plus any other language on demand. iOS-style PWA.

> "The help exists. People just can't find it, read it, or know which part applies to them."

## Run

```bash
npm install
cp .env.example .env.local   # add keys (optional, see below)
npm run dev                  # http://localhost:3000
```

**Works with no keys.** Every API route has a deterministic fallback, so the full demo runs offline: canned results for the 3 sample letters, extractive answers from the source corpus, curated legal-aid orgs for Houston/Dallas/Austin, and sample events/jobs. Fallback responses carry `sample: true`, and the UI shows a "Sample results" note. If a live call fails mid-demo, the route quietly falls back.

| Env var | Enables |
|---|---|
| `GEMINI_API_KEY` | UI translation, trusted webpage reading/translation, and translated event descriptions. |
| `MUSE_API_KEY` | All chat (Ask Landed, legal Q&A, document chat), document analysis, plans, prep summaries, credential guidance, event drafting and web discovery. Uses the same Meta Responses connection throughout; Gemini is never used as a chat fallback. |
| `SERPAPI_KEY` | Live Google Maps (legal help), Google Events, Google Jobs. Cached in memory for 10 min per query. |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Email and password sign-in (see Accounts). Required in production. |

Uploading your own photo needs a Muse Spark key; the sample letters work without one.

## Accounts

Sign-in uses Supabase Auth with email and password (`/login`). `middleware.ts` checks the session on every request: the landing page and `/login` are public, every other page redirects to `/login?next=…`, and every API route except `/api/auth/*` returns 401. Settings shows the signed-in email and **Sign Out**.

Setup:
1. Create a Supabase project. Under **Authentication → Providers**, Email is on by default.
2. Copy the project URL and anon key from **Project Settings → API** into `.env.local`.
3. Under **Authentication → URL Configuration**, set the Site URL (e.g. `http://localhost:3000`) and add `http://localhost:3000/api/auth/callback` (plus your production URL) to the redirect URLs.
4. With **Confirm email** on (the default), new accounts get a link that lands on `/api/auth/callback`. Turn it off to sign people in straight after sign-up.
5. Open **SQL Editor** in Supabase, paste `supabase/migrations/20261025000000_user_data.sql` and run it. It creates the `profiles` and `user_data` tables with row level security, so each person can only read and write their own rows.

Without the two Supabase keys, `npm run dev` runs the app open with no sign-in, so the demo still works offline. A production build without them refuses requests.

**Saved to the account** (`lib/sync.ts`): the app still reads and writes IndexedDB, and every save is also uploaded to Supabase. Onboarding answers (language, name, country, city, languages, months in the US, children, work, challenges) go to `profiles`. The plan, dates, checklist, saved questions, settings, prep summary, a typed-in language and, if "Save chat" is on, the chat go to `user_data` (one row per kind, as JSON). On sign-in the account's data is written to the device and the app opens in the person's language. Anything only on the device (saved before signing up) is uploaded. Edits that haven't uploaded yet (offline) are remembered and win over the account's copy. Sign Out uploads what's pending and clears the device. Delete My Data also deletes the rows in the account.

## Demo script (Section 12)

1. `/es`: landing in Spanish, "Por qué importa" stats.
2. **Usar Perfil de Demostración**: Maria, nurse from Venezuela, Houston, 2 months. One tap: **Crear Mi Plan**.
3. **Legal** → Escanear una Carta → Probar una Carta de Muestra → **Aviso de audiencia**. High-risk banner; **Agregar** the hearing date. Status card turns red: "Muy pronto: en 45 días".
4. **Hacer una Pregunta**: "¿Puedo viajar a Venezuela?" is flagged case-specific. You get general sources and **Buscar Ayuda Legal Gratis Cerca**, which opens Houston legal aid filtered to Spanish.
5. **¿Qué Debo Preparar?** → Crear Resumen. Bilingual summary with Share / Print (prints both languages).
6. **Comunidad** (events + "Ana"), **Empleos** (nurse → Texas Board of Nursing card).

## Languages

- Bundled languages are listed in `i18n/languages.ts` (with right-to-left flags for Arabic, Persian/Dari, Pashto and Urdu). Each has `messages/<code>.json`.
- `en.json` and `es.json` are hand-written. The rest were machine-translated from `en.json` with `gemini-3.5-flash-lite`: after adding or changing English strings, run `npm run translate:messages -- --all` (or name codes: `-- fr ko`). Placeholders and plural syntax are validated, and any string that fails stays in English.
- **Another language**: onboarding, Settings and the landing page let people type any language. `/api/translate` (needs `GEMINI_API_KEY`) identifies it, translates the UI with `gemini-3.5-flash-lite`, and the result is stored on the device (IndexedDB) and served under the `/und/...` locale. A typed name that matches a bundled language ("Farsi", "Mandarin") just switches to it. AI answers follow the chosen language through the `x-landed-language` header.
- Machine translations have not been reviewed by native speakers yet.

## Things to Take Care Of (checklist)

- `/legal/checklist` and `/legal/checklist/[id]`. Structure, flags and links are in `data/checklist.json`; the words (titles, explanations, "How to Do It" steps, link titles) are in `messages/*.json` under `checklist.items`. Items marked `requires` only show for people they apply to (children, Texas). Completion is saved on the device (`landed:checklist`, with the date it was done).
- Every link must pass the allowlist in `lib/links.ts` (any `.gov` = Official; reviewed nonprofits = Nonprofit). Links can store per-language URLs (`{ "en": …, "es": … }`) and a `lastVerified` date, shown as "Checked October 2026".
- `npm run check-links` checks every checklist, step and source URL (all languages) and fails on broken or non-allowlisted ones. `npm run check-links -- --write` also updates `lastVerified`.

## In-app browser

Every external link goes through `useOpenLink()` (`components/browser/InAppBrowser.tsx`). It opens the site's own version in the user's language when one exists (stored URL or `/api/page-languages`), otherwise an AI reading view for `.gov` pages only (`/api/translate-page`, cached 24 h), otherwise Landed's summary plus the original. `/api/frame-check` decides between a sandboxed iframe and a summary + "Open Page". Only allowlisted pages are ever fetched by the server, and nothing about the user is sent.

## Ask Landed

A chat panel (Home, the Ask tab, the checklist, each checklist item) backed by `/api/assistant`, a tool-calling loop over `generateJSON`. The device sends only the data stores a question is about (`routeStores` in `lib/assistant.ts`); if the model needs another, the server returns `needData` and the device sends just that slice. Legal topics are answered only from `searchTrustedSources` (source library, checklist, then an allowlist-restricted live search). Changes to data are proposals the person confirms. `npm run test:assistant` runs the acceptance tests against `npm run dev`.

**Model routing:** Muse Spark handles chat and general AI tasks. Gemini handles explicit translation/reading requests. `LLM_PROVIDER` no longer selects a provider. Set `META_MODEL_API_BASE` and `MUSE_SEARCH_MODEL` to override the shared Muse connection. Chat retains its existing limited/sample responses when Muse is unavailable; it never switches to Gemini.

## Privacy

- User data lives in IndexedDB on the device (`lib/storage.ts`) and is copied to the person's Supabase account (see Accounts). Supabase row level security limits each account to its own rows.
- Photos are downscaled to JPEG in the browser, sent once to `/api/scan`, and dropped. The server never writes or logs them, and the client clears its preview when the result arrives.
- A-numbers and receipt numbers are masked to the last 4 characters on the server (`lib/mask.ts`) and again before saving.
- Settings → Delete My Data clears IndexedDB after an iOS-style confirmation.

## Safety

- `lib/classify.ts`: EN/ES keyword rules flag case-specific questions. Ambiguous questions (first person + a legal topic) go to an LLM check, or default to case-specific when there is no key. Run `npm run test:classify` (16 EN/ES cases).
- `/api/ask` only sees the retrieved excerpts from `data/sources/*.md`. Citations are filtered to the URLs we provided, and an answer with no matching source says "I don't know".
- Case-specific questions and high-risk letters always show the "Find free legal help" CTA.

## Layout

- `components/ios/`: HIG kit (NavBar with collapsing large title, TabBar, ListSection/ListRow, Sheet with detents and swipe to dismiss, Alert, SegmentedControl, Toggle, SearchField, Spinner, Toast).
- Type sizes are in `rem` (they follow the user's text size). Spacing is in `px` (see `tailwind.config.ts`), so 200% text reflows without blowing up margins.
- Colors are iOS system tokens in `app/globals.css` with light and dark values. A few text-carrying tokens (`--tint`, `--red-text`, `--secondary-label`) are slightly darkened from the HIG values so body text meets WCAG AA.
- `/legal/scan` and `/legal/prep` render the Legal dashboard with that sheet open, so they are deep-linkable but still present as sheets.
- Sample letters (`lib/demoLetters.ts`) are generated as SVG with dates relative to today, then rasterized client-side. That way the hearing is always about 45 days out. They are clearly marked SAMPLE and use invented names and numbers.
#   L a n d e d 
 
 #   L a n d e d 
 
 