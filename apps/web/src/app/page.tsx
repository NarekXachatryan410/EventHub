import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ContactRound,
  MailCheck,
  MapPin,
  QrCode,
  Sparkles,
} from "lucide-react";
import { EventCoverImage } from "@/components/events/event-cover-image";
import { apiBaseUrl } from "@/lib/api";

type FeaturedEvent = {
  title: string;
  slug: string;
  description: string;
  location: string;
  startDate: string;
  type: string;
  coverImage: string | null;
};

async function loadFeaturedEvents(): Promise<{ events: FeaturedEvent[]; available: boolean }> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/events`, { cache: "no-store" });
    if (!response.ok) return { events: [], available: false };
    const events = await response.json() as FeaturedEvent[];
    return { events: events.slice(0, 3), available: true };
  } catch {
    return { events: [], available: false };
  }
}

const workflow = [
  { icon: MailCheck, title: "Before the event", detail: "Registration, attendee emails, and reminders stay together." },
  { icon: QrCode, title: "On event day", detail: "Give your team a clear, fast check-in workspace." },
  { icon: ContactRound, title: "After the event", detail: "Keep attendee history, feedback, and follow-up in view." },
];

export default function Home() {
  return (
    <main className="eh-public-home min-h-screen overflow-hidden text-slate-950">
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link aria-label="EventHub home" className="inline-flex items-center gap-3" href="/">
          <span className="eh-mark flex size-10 items-center justify-center rounded-xl text-white">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.04em]">Event<span className="eh-brand-text">Hub</span></span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
          <Link className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-950 sm:px-4" href="/events">
            Explore events
          </Link>
          <Link className="eh-secondary-button inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 shadow-sm sm:px-4" href="/login">
            Staff sign in <ArrowUpRight aria-hidden="true" className="size-4 text-slate-500" />
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[1.03fr_0.97fr] lg:px-12 lg:pt-24">
        <div aria-hidden="true" className="eh-ambient-orb pointer-events-none absolute -right-40 top-0 -z-0 size-[32rem] rounded-full blur-[100px]" />
        <div className="relative z-10 max-w-2xl">
          <p className="eh-eyebrow inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold tracking-wide shadow-sm">
            <Sparkles aria-hidden="true" className="size-3.5" /> EVENT OPERATIONS, CONNECTED
          </p>
          <h1 className="mt-7 text-[clamp(3rem,6.7vw,5.5rem)] font-semibold leading-[0.99] tracking-[-0.07em]">
            Bring every detail <span className="eh-gradient-text">into focus.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            From the first registration to the final check-in, EventHub helps your team bring people together with less busywork.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link className="eh-primary-button group inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white" href="/events">
              Browse events <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link className="eh-secondary-button inline-flex h-12 items-center justify-center rounded-xl border px-5 text-sm font-semibold shadow-sm" href="/login">
              Open staff workspace
            </Link>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">For event teams, organizers, and the people who make the day happen.</p>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-xl lg:ml-auto">
          <div aria-hidden="true" className="eh-preview-glow absolute -inset-5 rounded-[2rem] blur-xl" />
          <section aria-label="EventHub workflow" className="eh-product-preview relative overflow-hidden rounded-[1.75rem] border p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">One connected workflow</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-2xl">From plan to welcome</h2>
              </div>
              <span className="eh-icon-tile flex size-10 shrink-0 items-center justify-center rounded-xl">
                <CalendarDays aria-hidden="true" className="size-5" />
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {workflow.map(({ icon: Icon, title, detail }, index) => (
                <article className="flex gap-4 py-5" key={title}>
                  <span className="eh-workflow-icon relative flex size-10 shrink-0 items-center justify-center rounded-xl ring-1">
                    <Icon aria-hidden="true" className="size-[18px]" />
                    <span className="eh-step-badge absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border-2 text-[9px] font-bold">{index + 1}</span>
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>
                  </div>
                  <Check aria-hidden="true" className="ml-auto mt-1 size-4 shrink-0 text-emerald-400" />
                </article>
              ))}
            </div>
            <div className="eh-preview-footer flex flex-col justify-between gap-3 rounded-2xl px-4 py-4 text-white sm:flex-row sm:items-center sm:px-5">
              <div>
                <p className="text-sm font-semibold">Thoughtful tools for event teams</p>
                <p className="mt-1 text-xs text-slate-300">Registration · check-in · attendee relationships</p>
              </div>
              <Link aria-label="Explore events" className="flex size-9 items-center justify-center self-start rounded-xl bg-white/10 text-white hover:bg-white/20 sm:self-auto" href="/events">
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </section>
          <div aria-hidden="true" className="eh-preview-glow absolute -bottom-7 -left-4 -z-10 h-24 w-40 rounded-full blur-3xl" />
        </div>
      </section>

      <section aria-labelledby="featured-title" className="eh-featured mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 lg:px-12">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eh-section-label text-xs font-semibold uppercase tracking-[0.17em]">Discover</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl" id="featured-title">Events worth showing up for</h2>
          </div>
          <Link className="eh-text-link inline-flex items-center gap-2 text-sm font-semibold" href="/events">Explore all events <ArrowRight aria-hidden="true" className="size-4" /></Link>
        </div>
        <Suspense fallback={<FeaturedEventsFallback />}>
          <FeaturedEvents />
        </Suspense>
      </section>

      <footer className="eh-footer border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <p>Built for the Academy community.</p>
          <p>Events are easier when every detail has a place.</p>
        </div>
      </footer>
    </main>
  );
}

async function FeaturedEvents() {
  const featured = await loadFeaturedEvents();
  return <>
    {featured.events.length ? (
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {featured.events.map((event) => <li className="eh-featured-card overflow-hidden rounded-2xl border" key={event.slug}>
          {event.coverImage ? <EventCoverImage alt="" className="h-40 w-full object-cover" src={event.coverImage} /> : <div aria-hidden="true" className="eh-featured-art flex h-40 items-end p-5"><CalendarDays className="size-8" /></div>}
          <div className="p-5">
            <p className="eh-section-label inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"><CalendarDays aria-hidden="true" className="size-3.5" />{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(event.startDate))}</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight"><Link className="hover:text-sky-300" href={`/events/${event.slug}`}>{event.title}</Link></h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{event.description.replace(/<[^>]*>/g, " ")}</p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-500"><MapPin aria-hidden="true" className="size-3.5" />{event.location}</p>
          </div>
        </li>)}
      </ul>
    ) : <p className="eh-featured-empty rounded-2xl border border-dashed p-7 text-sm text-slate-500">{featured.available ? "There are no published events right now. Please check back soon." : "Event previews are temporarily unavailable. You can still browse the event page for the latest listings."}</p>}
  </>;
}

function FeaturedEventsFallback() {
  return <div aria-label="Loading featured events" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status">
    {[0, 1, 2].map((index) => <div className="h-72 animate-pulse rounded-2xl bg-slate-200" key={index} />)}
  </div>;
}
