"use client";

import type { DataFilters, DataRequest, Store } from "./assistant";
import { itemsFor } from "./checklist";
import { daysUntil } from "./hooks";
import { getChecklist, getDates, getPlan, getPrep, getProfile, getQuestions } from "./storage";

// Reads one slice of the person's data from IndexedDB for Ask Landed. Each store returns
// only the fields an answer needs: no names, no notes beyond what they typed, no images
// (none are stored), and ID numbers were already masked when saved.

async function slice(store: Store, f: DataFilters = {}): Promise<unknown> {
  switch (store) {
    case "profile": {
      const p = await getProfile();
      if (!p) return null;
      return {
        city: p.city,
        originCountry: p.originCountry,
        languages: p.languages,
        monthsInUSAtSignup: p.monthsInUS,
        signedUpOn: p.createdAt.slice(0, 10),
        hasChildren: p.hasChildren,
        workBackground: p.workBackground,
        feelsHardest: p.biggestChallenge,
      };
    }
    case "dates": {
      const dates = (await getDates())
        .map((d) => ({ label: d.label, docType: d.docType, date: d.date, daysFromToday: daysUntil(d.date), note: d.note }))
        .filter((d) => (f.withinDays === undefined ? true : d.daysFromToday >= -30 && d.daysFromToday <= f.withinDays));
      return dates.sort((a, b) => a.date.localeCompare(b.date));
    }
    case "checklist": {
      const [state, profile] = await Promise.all([getChecklist(), getProfile()]);
      const since = f.sinceDays === undefined ? 0 : Date.now() - f.sinceDays * 86_400_000;
      return itemsFor(profile)
        .map((i) => ({ id: i.id, section: i.section, done: Boolean(state[i.id]?.done), doneOn: state[i.id]?.doneAt?.slice(0, 10) }))
        .filter((i) => (f.status === "done" ? i.done : f.status === "open" ? !i.done : true))
        .filter((i) => (since ? i.doneOn && new Date(i.doneOn).getTime() >= since : true));
    }
    case "plan": {
      const plan = await getPlan();
      return plan
        .map((s) => ({ title: s.title, category: s.category, dueInDays: s.dueInDays, done: s.done }))
        .filter((s) => (f.status === "done" ? s.done : f.status === "open" ? !s.done : true));
    }
    case "prepSummaries": {
      const [prep, questions] = await Promise.all([getPrep(), getQuestions()]);
      return {
        appointmentPrep: prep ? { createdOn: prep.createdAt.slice(0, 10), questions: prep.questions, summary: prep.summary.summaryEnglish } : null,
        savedQuestions: questions.slice(-10).map((q) => ({ question: q.question, askedOn: q.askedAt.slice(0, 10) })),
      };
    }
  }
}

export async function readStores(requests: DataRequest[]): Promise<Partial<Record<Store, unknown>>> {
  const out: Partial<Record<Store, unknown>> = {};
  await Promise.all(requests.map(async (r) => (out[r.store] = await slice(r.store, r.filters))));
  return out;
}
