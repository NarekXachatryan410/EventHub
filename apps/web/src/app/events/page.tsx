import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Sparkles } from "lucide-react";
import { apiBaseUrl } from "@/lib/api";
import { EventCoverImage } from "@/components/events/event-cover-image";

export const metadata = {
  title: "Academy Events | EventHub",
  description: "Browse upcoming Academy events and register online.",
  alternates: { canonical: "/events" },
};

type PublicEvent = {
  title: string;
  slug: string;
  description: string;
  location: string;
  startDate: string;
  type: string;
  status: string;
  registrationEnabled: boolean;
  registrationDeadline: string;
  remainingAttendees: number | null;
  coverImage: string | null;
};

async function getEvents(): Promise<PublicEvent[]> {
  const response = await fetch(`${apiBaseUrl}/api/events`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load events (${response.status})`);
  }
  return response.json() as Promise<PublicEvent[]>;
}

export default async function EventsPage() {
  return (
    <main className="eh-public-page mx-auto min-h-screen w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
      <header className="flex items-center justify-between border-b border-slate-200/80 pb-5">
        <Link className="inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight text-slate-900" href="/">
          <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><CalendarDays aria-hidden="true" className="size-4" /></span>
          Event<span className="-ml-2 text-indigo-600">Hub</span>
        </Link>
        <Link className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-950" href="/login">Staff sign in</Link>
      </header>
      <section className="mx-auto max-w-3xl pb-2 pt-12 text-center sm:pt-16">
        <p className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700"><Sparkles aria-hidden="true" className="size-3.5" />Academy community</p>
        <h1 className="mt-5 text-4xl sm:text-5xl">Find your next event.</h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Explore upcoming Academy events and reserve your place in just a few steps.</p>
      </section>
      <Suspense fallback={<EventsFallback />}>
        <EventsList />
      </Suspense>
    </main>
  );
}

async function EventsList() {
  const events = await getEvents();
  return events.length === 0 ? (
    <p className="mt-12 rounded-xl border border-dashed border-stone-300 p-8 text-stone-600">
      There are no published events right now. Please check back soon.
    </p>
  ) : (
    <ul className="mt-10 grid gap-5 lg:grid-cols-2">
      {events.map((event) => (
        <EventCard event={event} key={event.slug} />
      ))}
    </ul>
  );
}

function EventCard({ event }: { event: PublicEvent }) {
  const registrationOpen =
    event.status === "PUBLISHED" &&
    event.registrationEnabled &&
    new Date(event.registrationDeadline) > new Date();
  const waitlistAvailable =
    registrationOpen && event.remainingAttendees === 0;

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {event.coverImage ? (
        <EventCoverImage alt="" className="h-56 w-full object-cover" src={event.coverImage} />
      ) : (
        <div aria-hidden="true" className="relative flex h-44 items-end overflow-hidden bg-gradient-to-br from-[#292652] via-[#5149b8] to-[#9e96f5] p-6 text-white">
          <span className="absolute -right-6 -top-14 size-56 rounded-full border border-white/15" />
          <span className="absolute -right-1 -top-9 size-44 rounded-full border border-white/15" />
          <CalendarDays className="absolute right-7 top-7 size-11 text-white/80" />
          <span className="relative rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur">Academy event</span>
        </div>
      )}
      <div className="p-5 sm:p-6">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          {new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(event.startDate))}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
          <Link className="hover:text-indigo-700" href={`/events/${event.slug}`}>
            {event.title}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
          {event.description.replace(/<[^>]*>/g, " ")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500">
          <span>{event.type.replaceAll("_", " ")}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5" />{event.location}</span>
          {event.remainingAttendees !== null && <span>{event.remainingAttendees} {event.remainingAttendees === 1 ? "place" : "places"} left</span>}
        </div>
        <Link
          className="group mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm shadow-indigo-900/10 transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          href={`/events/${event.slug}#registration`}
        >
          {waitlistAvailable ? "Join waitlist" : registrationOpen ? "Register" : "View details"}
          <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </li>
  );
}

function EventsFallback() {
  return (
    <div
      aria-label="Loading events"
      className="mt-10 grid gap-5 md:grid-cols-2"
      role="status"
    >
      <div className="h-72 animate-pulse rounded-2xl bg-stone-100" />
      <div className="h-72 animate-pulse rounded-2xl bg-stone-100" />
    </div>
  );
}
