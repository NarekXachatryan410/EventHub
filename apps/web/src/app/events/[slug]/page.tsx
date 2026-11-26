import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationForm } from "@/components/events/registration-form";
import { EventCoverImage } from "@/components/events/event-cover-image";
import { apiBaseUrl, siteUrl } from "@/lib/api";

type PublicEvent = {
  id: string;
  title: string;
  slug: string;
  description: string;
  coverImage: string | null;
  type: string;
  status: string;
  location: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  registrationEnabled: boolean;
  maxAttendees: number | null;
  remainingAttendees: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  registrationQuestions: Array<{
    key: string;
    label: string;
    type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
    required: boolean;
    options?: string[];
  }> | null;
  organizer: { firstName: string; lastName: string };
};

async function getEvent(slug: string): Promise<PublicEvent | null> {
  const response = await fetch(
    `${apiBaseUrl}/api/events/${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Could not load event (${response.status})`);
  }
  return response.json() as Promise<PublicEvent>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) {
    return { title: "Event not found | EventHub", robots: { index: false } };
  }
  const canonical = `${siteUrl}/events/${event.slug}`;
  const description =
    event.seoDescription ?? event.description.replace(/<[^>]*>/g, " ").slice(0, 300);
  return {
    title: event.seoTitle ?? `${event.title} | EventHub`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: event.seoTitle ?? event.title,
      description,
      url: canonical,
      images: event.coverImage ? [event.coverImage] : [],
    },
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main
          aria-label="Loading event"
          className="eh-public-page mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12"
          role="status"
        >
          Loading event details…
        </main>
      }
    >
      <EventContent params={params} />
    </Suspense>
  );
}

async function EventContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) {
    notFound();
  }

  const registrationOpen =
    event.status === "PUBLISHED" &&
    event.registrationEnabled &&
    new Date(event.registrationDeadline) > new Date();
  const waitlistAvailable =
    registrationOpen && event.remainingAttendees === 0;
  const canRegister =
    registrationOpen &&
    (event.remainingAttendees === null || event.remainingAttendees > 0);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.seoDescription ?? event.description.replace(/<[^>]*>/g, " "),
    startDate: event.startDate,
    endDate: event.endDate,
    eventStatus:
      event.status === "CANCELLED"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: event.location },
    organizer: {
      "@type": "Person",
      name: `${event.organizer.firstName} ${event.organizer.lastName}`,
    },
    ...(event.coverImage ? { image: [event.coverImage] } : {}),
    url: `${siteUrl}/events/${event.slug}`,
  };

  return (
    <main className="eh-public-page mx-auto min-h-screen w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
      <Link className="text-sm font-medium text-indigo-700" href="/events">
        <span aria-hidden="true">←</span> All events
      </Link>
      {event.coverImage && (
        <EventCoverImage
          alt=""
          className="mt-8 max-h-[28rem] w-full rounded-2xl object-cover"
          src={event.coverImage}
        />
      )}
      {!event.coverImage && (
        <div aria-hidden="true" className="relative mt-7 flex h-48 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-[#22213f] via-[#5049aa] to-[#9b95e8] text-white shadow-xl shadow-indigo-950/10 sm:h-64">
          <span className="absolute -right-12 -top-28 size-80 rounded-full border border-white/15" />
          <span className="absolute -right-1 -top-20 size-64 rounded-full border border-white/15" />
          <CalendarIllustration />
        </div>
      )}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
        <article className="min-w-0 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm sm:p-8">
          <p className="inline-flex rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-indigo-700">
            {event.type.replaceAll("_", " ")}
          </p>
          <h1 className="mt-4 text-4xl sm:text-5xl">{event.title}</h1>
          <div className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2 sm:p-5">
            <p>
              {new Intl.DateTimeFormat("en", {
                dateStyle: "full",
                timeStyle: "short",
              }).format(new Date(event.startDate))}
            </p>
            <p>{event.location}</p>
            <p className="sm:col-span-2">
              Organized by {event.organizer.firstName} {event.organizer.lastName}
            </p>
            <p className="sm:col-span-2">
              Registration closes{" "}
              {new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(event.registrationDeadline))}
            </p>
            {event.remainingAttendees !== null && (
              <p>{event.remainingAttendees} places remaining</p>
            )}
          </div>
          <div
            className="prose prose-stone mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: event.description }}
          />
        </article>
        <aside aria-label="Event registration" className="lg:sticky lg:top-24 lg:self-start" id="registration">
          {canRegister || waitlistAvailable ? (
            <RegistrationForm
              eventId={event.id}
              questions={event.registrationQuestions ?? []}
              waitlistAvailable={waitlistAvailable}
            />
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-stone-100 p-6">
              <h2 className="font-semibold">Registration is closed</h2>
              <p className="mt-2 text-sm text-stone-600">
                This event is no longer accepting registrations.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function CalendarIllustration() {
  return (
    <div className="relative flex size-20 items-center justify-center rounded-[1.6rem] border border-white/20 bg-white/10 shadow-2xl backdrop-blur-sm sm:size-24">
      <span className="absolute inset-x-4 top-5 h-1 rounded-full bg-white/75" />
      <span className="absolute left-5 top-3 h-4 w-1 rounded-full bg-white/75" />
      <span className="absolute right-5 top-3 h-4 w-1 rounded-full bg-white/75" />
      <span className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">E</span>
    </div>
  );
}
