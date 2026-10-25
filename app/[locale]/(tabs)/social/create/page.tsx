"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ImageUp, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ios/Button";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { NavBar } from "@/components/ios/NavBar";
import { Screen } from "@/components/ios/Screen";
import { Spinner } from "@/components/ios/Spinner";
import { useToast } from "@/components/ios/Toast";
import { MusePlanningHelp } from "@/components/MusePlanningHelp";
import { draftEvent, postEvent } from "@/lib/communityEvents";
import { useProfile } from "@/lib/hooks";
import { EVENT_INTERESTS } from "@/lib/interests";
import type { EventDraft } from "@/lib/types";

const EMPTY: EventDraft = { title: "", date: "", startTime: "", endTime: "", venue: "", address: "", cost: "", description: "", interests: [], guessed: [] };
const MAX_SIDE = 1600;

/** The photo, made smaller (and JPEG) so it uploads quickly. Nothing is saved. */
async function flyerDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function CreateEventPage() {
  const t = useTranslations("create");
  const tc = useTranslations("common");
  const tm = useTranslations("community");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [profile] = useProfile();
  const city = profile?.city || "Houston, TX";
  const [note, setNote] = useState("");
  const [flyer, setFlyer] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(EMPTY);
  const [filling, setFilling] = useState<"note" | "flyer" | null>(null);
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toLocaleDateString("en-CA");

  const fill = async (input: { description?: string; image?: string }, kind: "note" | "flyer") => {
    setFilling(kind);
    setError(null);
    try {
      const d = await draftEvent({ ...input, city, lang: locale });
      // What the AI found replaces the form; topics already picked are kept.
      setDraft((cur) => ({ ...d, interests: [...new Set([...cur.interests, ...d.interests])] }));
      setFilled(true);
    } catch {
      setError(kind === "flyer" ? t("flyerFailed") : t("fillFailed"));
    } finally {
      setFilling(null);
    }
  };

  const onFlyer = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const image = await flyerDataUrl(file);
      setFlyer(image);
      await fill({ image, description: note.trim() || undefined }, "flyer");
    } catch {
      setError(t("flyerUnreadable"));
    }
  };

  const set = (field: keyof EventDraft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    // An edited field is the person's own now, not a guess.
    setDraft((d) => ({ ...d, [field]: e.target.value, guessed: d.guessed.filter((g) => g !== field) }));

  const toggleInterest = (id: string) =>
    setDraft((d) => ({ ...d, interests: d.interests.includes(id) ? d.interests.filter((i) => i !== id) : [...d.interests, id] }));

  // Required to post: a title and a date from today on. Say which is missing, under the button.
  const missing = [
    ...(draft.title.trim().length < 3 ? [t("needTitle")] : []),
    ...(!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || draft.date < today ? [t("needDate")] : []),
  ];
  const ready = missing.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || posting) return;
    setPosting(true);
    try {
      await postEvent(draft, city);
      toast(t("posted"));
      router.replace("/social");
    } catch (err) {
      // PGRST205: the events table hasn't been created in Supabase yet (see supabase/migrations).
      toast((err as { code?: string })?.code === "PGRST205" ? t("notSetUp") : tc("error"));
      setPosting(false);
    }
  };

  const field = (name: keyof EventDraft, label: string, input: ReactNode, required = false) => (
    <label className="relative flex flex-col px-4 pt-2">
      <span className="flex items-center justify-between gap-2 text-footnote text-secondary-label">
        <span>
          {label}
          {required && (
            <>
              <span className="ml-0.5 text-red-text" aria-hidden>
                *
              </span>
              <span className="sr-only"> ({t("required")})</span>
            </>
          )}
        </span>
        {draft.guessed.includes(name) && (
          <span className="inline-flex items-center gap-1 text-sage">
            <Sparkles size={12} strokeWidth={2} aria-hidden />
            {t("suggested")}
          </span>
        )}
      </span>
      {input}
      <span className="absolute bottom-0 left-4 right-0 h-[0.5px] bg-separator" aria-hidden />
    </label>
  );
  const inputClass = "min-h-[44px] bg-transparent text-body outline-none placeholder:text-tertiary-label";

  return (
    <Screen push>
      <NavBar title={t("title")} back={{ href: "/social", label: tm("title") }} />
      <GroupedList className="pt-4">
        <MusePlanningHelp draft={draft} city={city} />

        <ListSection id="ai" header={t("aiTitle")} footer={t("aiFooter")} bare>
          <div className="flex flex-col gap-3 rounded-cell bg-cell p-4">
            <label htmlFor="event-note" className="text-subheadline text-label-soft">
              {t("noteLabel")}
            </label>
            <textarea
              id="event-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={t("notePlaceholder")}
              className="resize-none rounded-control border border-separator bg-transparent p-3 text-body outline-none placeholder:text-tertiary-label"
            />
            <div className="flex flex-wrap gap-2.5">
              <Button
                size="medium"
                icon={filling === "note" ? <Spinner size={16} /> : <Sparkles size={18} strokeWidth={1.75} aria-hidden />}
                onClick={() => fill({ description: note }, "note")}
                disabled={Boolean(filling) || !note.trim()}
              >
                {filling === "note" ? t("filling") : t("fill")}
              </Button>
              <Button
                variant="tinted"
                size="medium"
                icon={filling === "flyer" ? <Spinner size={16} /> : <ImageUp size={18} strokeWidth={1.75} aria-hidden />}
                onClick={() => fileRef.current?.click()}
                disabled={Boolean(filling)}
              >
                {filling === "flyer" ? t("readingFlyer") : t("uploadFlyer")}
              </Button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFlyer} tabIndex={-1} aria-hidden />
            </div>
            {flyer && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={flyer} alt={t("flyerAlt")} className="max-h-48 self-start rounded-control border border-separator object-contain" />
            )}
            {error && (
              <p role="alert" className="text-subheadline text-red-text">
                {error}
              </p>
            )}
          </div>
        </ListSection>

        {filled && (
          <p role="status" className="flex items-start gap-2 rounded-cell bg-green-tint p-4 text-subheadline text-label-soft">
            <Sparkles size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sage" aria-hidden />
            {t("filledNote")}
          </p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-6">
          <ListSection id="details" header={t("detailsTitle")} footer={t("requiredNote")} bare>
            <div className="list-section overflow-hidden rounded-cell bg-cell">
              {field("title", t("fieldTitle"), <input value={draft.title} onChange={set("title")} maxLength={120} required className={inputClass} />, true)}
              {field("date", t("fieldDate"), <input type="date" value={draft.date} min={today} onChange={set("date")} required className={inputClass} />, true)}
              {field("startTime", t("fieldStart"), <input value={draft.startTime} onChange={set("startTime")} maxLength={20} placeholder="6:00 PM" className={inputClass} />)}
              {field("endTime", t("fieldEnd"), <input value={draft.endTime} onChange={set("endTime")} maxLength={20} placeholder="8:00 PM" className={inputClass} />)}
              {field("venue", t("fieldVenue"), <input value={draft.venue} onChange={set("venue")} maxLength={120} className={inputClass} />)}
              {field("address", t("fieldAddress"), <input value={draft.address} onChange={set("address")} maxLength={200} className={inputClass} />)}
              {field("cost", t("fieldCost"), <input value={draft.cost} onChange={set("cost")} maxLength={60} placeholder={t("costPlaceholder")} className={inputClass} />)}
              {field(
                "description",
                t("fieldDescription"),
                <textarea value={draft.description} onChange={set("description")} maxLength={2000} rows={4} className={`${inputClass} resize-none py-2`} />
              )}
            </div>
          </ListSection>

          <ListSection id="topics" header={t("topicsTitle")} footer={t("topicsFooter")} bare>
            <div className="flex flex-wrap gap-2">
              {EVENT_INTERESTS.filter((i) => i.id !== "homeCountry").map(({ id }) => {
                const on = draft.interests.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleInterest(id)}
                    className={`pressable min-h-[44px] rounded-full px-4 text-callout ${
                      on ? "bg-tint-fill font-medium text-on-accent" : "border border-separator bg-cell text-label"
                    }`}
                  >
                    {tm(`interest_${id}`, { country: "" })}
                  </button>
                );
              })}
            </div>
          </ListSection>

          <p className="px-1 text-footnote text-secondary-label">{t("publicNote", { city: city.split(",")[0] })}</p>
          <Button type="submit" disabled={!ready || posting} aria-describedby={ready ? undefined : "post-missing"}>
            {posting ? t("posting") : t("post")}
          </Button>
          {!ready && (
            <p id="post-missing" className="-mt-3 text-center text-subheadline text-red-text">
              {missing.join(" ")}
            </p>
          )}
        </form>
      </GroupedList>
    </Screen>
  );
}
