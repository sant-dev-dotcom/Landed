import { isoFromToday } from "./demoLetters";
import type { EventListing, PostedEvent } from "./types";

// Local demo content: available on the first render, before any network requests.
export function eventsFallback(city: string, locale: string): EventListing[] {
  const c = city.split(",")[0];
  const es = locale === "es";
  // Sample listings for the demo (shown with "Sample results"), so the descriptions are
  // illustrative, not real events.
  return [
    {
      title: es ? "Grupo de conversación en inglés (gratis)" : "Free English Conversation Group",
      startDate: isoFromToday(3),
      when: "6:00 – 7:30 PM",
      venue: es ? "Biblioteca pública" : "Public Library",
      location: es ? `Biblioteca pública, ${c}` : `Public Library, ${c}`,
      description: es
        ? "Practique inglés hablando en grupos pequeños con voluntarios amables. Hablamos de temas de todos los días, como ir al médico, hacer compras o hablar con el maestro de sus hijos. Todos los niveles son bienvenidos y no necesita inscribirse. Traiga solo sus ganas de practicar."
        : "Practice speaking English in small groups with friendly volunteer tutors. Each week covers everyday topics like visiting the doctor, shopping, or talking with your child's teacher. All levels are welcome and there's no sign-up. Just bring yourself and a willingness to try.",
    },
    {
      title: es ? "Feria de empleo comunitaria" : "Community Job Fair",
      startDate: isoFromToday(9),
      when: "10:00 AM – 2:00 PM",
      venue: es ? "Centro comunitario" : "Community Center",
      location: es ? `Centro comunitario, ${c}` : `Community Center, ${c}`,
      description: es
        ? "Conozca a más de 30 empleadores locales que están contratando en salud, almacenes, hoteles, construcción y servicio al cliente. Habrá voluntarios para ayudarle a revisar su currículum e intérpretes en español. Traiga varias copias de su currículum y una identificación. La entrada es gratis."
        : "Meet more than 30 local employers hiring in health care, warehouses, hotels, construction and customer service. Volunteers will help you polish your résumé, and Spanish interpreters will be on hand. Bring several copies of your résumé and a photo ID. Free to attend.",
    },
    {
      title: es ? "Taller: Conozca sus derechos como inquilino" : "Workshop: Know Your Rights as a Tenant",
      startDate: isoFromToday(12),
      when: "5:30 – 7:00 PM",
      venue: es ? "Clínica legal comunitaria" : "Community Legal Clinic",
      location: c,
      description: es
        ? "Un abogado de una organización sin fines de lucro explica cómo leer su contrato de renta, cómo pedir reparaciones por escrito y qué hacer si recibe un aviso de desalojo. Habrá tiempo para preguntas. El taller es gratis y se ofrece en inglés y español."
        : "A nonprofit housing attorney explains how to read your lease, how to ask for repairs in writing, and what to do if you get an eviction notice. There's time for questions at the end. Free, with English and Spanish sessions.",
    },
    {
      title: es ? "Noche de bienvenida para familias recién llegadas" : "Welcome Night for Newcomer Families",
      startDate: isoFromToday(17),
      when: "6:00 – 8:00 PM",
      venue: es ? "Salón comunitario de la iglesia" : "Church Community Hall",
      location: c,
      description: es
        ? "Una cena compartida para conocer a otras familias que llegaron hace poco y a vecinos que ya pasaron por lo mismo. Habrá actividades para niños, información sobre escuelas y servicios locales, y comida de varios países. Toda la familia es bienvenida."
        : "A potluck dinner to meet other families who've just arrived and neighbors who've been through it. There will be activities for kids, tables with information on schools and local services, and food from around the world. The whole family is welcome.",
    },
  ];
}

/** Clickable sample listings; ids stay stable across list and detail screens. */
export function demoEvents(city: string, locale: string): EventListing[] {
  return eventsFallback(city, locale).map((event, index) => ({
    ...event,
    id: ["demo-event", encodeURIComponent(city), locale, index, event.startDate].join("-"),
    sample: true,
  }));
}

/** The same local samples for the Posted on Landed view, including device-only RSVPs. */
export function demoPostedEvents(city: string, locale: string): PostedEvent[] {
  return demoEvents(city, locale).map((event, index) => ({
    id: event.id!,
    title: event.title,
    description: event.description ?? "",
    date: event.startDate!,
    startTime: event.when,
    venue: event.venue,
    city,
    interests: [],
    sample: true,
    going: [12, 28, 9, 18][index] ?? 8,
  }));
}
