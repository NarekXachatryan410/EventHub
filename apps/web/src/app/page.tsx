import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-stone-50 text-stone-950">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link className="text-xl font-semibold tracking-tight" href="/">
          Event<span className="text-indigo-600">Hub</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            href="/login"
          >
            Staff sign in
          </Link>
          <span className="hidden rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-stone-600 sm:inline-flex">
            Academy events
          </span>
        </div>
      </header>
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24 pt-16">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Plan · Publish · Welcome
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight sm:text-7xl">
          Every Academy event, in one place.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600">
          Create events, make registration simple, and give every attendee a
          smoother experience from sign-up to check-in.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-500"
            href="/events"
          >
            Browse events
          </Link>
        </div>
      </section>
      <footer className="mx-auto w-full max-w-6xl px-6 py-6 text-sm text-stone-500">
        Built for the Academy community.
      </footer>
    </main>
  );
}
