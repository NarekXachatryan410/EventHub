import { Suspense } from "react";
import Link from "next/link";
import { apiBaseUrl } from "@/lib/api";

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
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <Link className="text-sm font-medium text-indigo-700" href="/">
        EventHub
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">Academy events</h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Find an upcoming event and reserve your place.
      </p>
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
    <ul className="mt-10 grid gap-5 md:grid-cols-2">
      {events.map((event) => (
        <li
          className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
          key={event.slug}
        >
          {event.coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-52 w-full object-cover"
              src={event.coverImage}
            />
          )}
          <div className="p-6">
            <p className="text-sm font-medium text-indigo-700">
              {new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(event.startDate))}
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              <Link className="hover:text-indigo-700" href={`/events/${event.slug}`}>
                {event.title}
              </Link>
            </h2>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">
              {event.description.replace(/<[^>]*>/g, " ")}
            </p>
            <p className="mt-4 text-sm text-stone-500">
              {event.type.replaceAll("_", " ")} · {event.location}
            </p>
          </div>
        </li>
      ))}
    </ul>
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
