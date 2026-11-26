import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ContactRound,
  MailCheck,
  QrCode,
  Sparkles,
} from "lucide-react";

const workflow = [
  { icon: MailCheck, title: "Before the event", detail: "Registration, attendee emails, and reminders stay together." },
  { icon: QrCode, title: "On event day", detail: "Give your team a clear, fast check-in workspace." },
  { icon: ContactRound, title: "After the event", detail: "Keep attendee history, feedback, and follow-up in view." },
];

export default function Home() {
  return (
    <main className="eh-public-home min-h-screen overflow-hidden bg-[#f7f8fc] text-slate-950">
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link aria-label="EventHub home" className="inline-flex items-center gap-3" href="/">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#5548d9] text-white shadow-lg shadow-indigo-900/15">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.04em]">Event<span className="text-[#5548d9]">Hub</span></span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
          <Link className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-950 sm:px-4" href="/events">
            Explore events
          </Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 sm:px-4" href="/login">
            Staff sign in <ArrowUpRight aria-hidden="true" className="size-4 text-slate-500" />
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[1.03fr_0.97fr] lg:px-12 lg:pt-24">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-0 -z-0 size-[32rem] rounded-full bg-indigo-200/35 blur-[100px]" />
        <div className="relative z-10 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3.5 py-2 text-xs font-semibold tracking-wide text-indigo-700 shadow-sm shadow-indigo-900/5">
            <Sparkles aria-hidden="true" className="size-3.5" /> EVENT OPERATIONS FOR ACADEMY COMMUNITIES
          </p>
          <h1 className="mt-7 text-[clamp(3rem,6.7vw,5.5rem)] font-semibold leading-[0.99] tracking-[-0.07em] text-[#171d31]">
            Make every event feel <span className="text-[#5548d9]">well run.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            From the first registration to the final check-in, EventHub helps your team bring people together with less busywork.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#5548d9] px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/15 hover:-translate-y-0.5 hover:bg-[#493ec4]" href="/events">
              Browse events <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50" href="/login">
              Open staff workspace
            </Link>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">For event teams, organizers, and the people who make the day happen.</p>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-xl lg:ml-auto">
          <div aria-hidden="true" className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-indigo-100/80 via-white/20 to-violet-100/70 blur-xl" />
          <section aria-label="EventHub workflow" className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-[0_35px_90px_-45px_rgba(31,35,75,0.35)] sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">One connected workflow</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-2xl">From plan to welcome</h2>
              </div>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <CalendarDays aria-hidden="true" className="size-5" />
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {workflow.map(({ icon: Icon, title, detail }, index) => (
                <article className="flex gap-4 py-5" key={title}>
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200/80">
                    <Icon aria-hidden="true" className="size-[18px]" />
                    <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-[9px] font-bold text-white">{index + 1}</span>
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>
                  </div>
                  <Check aria-hidden="true" className="ml-auto mt-1 size-4 shrink-0 text-emerald-600" />
                </article>
              ))}
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-2xl bg-[#171a31] px-4 py-4 text-white sm:flex-row sm:items-center sm:px-5">
              <div>
                <p className="text-sm font-semibold">Thoughtful tools for event teams</p>
                <p className="mt-1 text-xs text-slate-300">Registration · check-in · attendee relationships</p>
              </div>
              <Link aria-label="Explore events" className="flex size-9 items-center justify-center self-start rounded-xl bg-white/10 text-white hover:bg-white/20 sm:self-auto" href="/events">
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </section>
          <div aria-hidden="true" className="absolute -bottom-7 -left-4 -z-10 h-24 w-40 rounded-full bg-violet-300/45 blur-3xl" />
        </div>
      </section>

      <footer className="border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <p>Built for the Academy community.</p>
          <p>Events are easier when every detail has a place.</p>
        </div>
      </footer>
    </main>
  );
}
