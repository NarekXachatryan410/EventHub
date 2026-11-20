"use client";

import {
  ArrowRight,
  CalendarDays,
  CirclePlus,
  ExternalLink,
  MapPin,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/auth/staff-dashboard";
import { EventCoverImage } from "@/components/events/event-cover-image";
import { staffApi, formatDate, type StaffEvent } from "@/lib/staff-api";

export function EventList() {
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadEvents = useCallback(async () => {
    try {
      setEvents(await staffApi<StaffEvent[]>("/events/manage"));
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadEvents);
  }, [loadEvents]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter(
      (event) =>
        !term ||
        event.title.toLowerCase().includes(term) ||
        event.location.toLowerCase().includes(term) ||
        event.status.toLowerCase().includes(term),
    );
  }, [events, search]);

  return (
    <main>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-indigo-700">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Events</h1>
          <p className="mt-2 text-sm text-slate-600">Create and manage your Academy events.</p>
        </div>
        <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700" href="/dashboard/events/new">
          <CirclePlus aria-hidden="true" className="size-4" />
          Create event
        </Link>
      </div>

      {error && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">{loading ? "Loading events…" : `${filtered.length} ${filtered.length === 1 ? "event" : "events"}`}</p>
        <label className="relative block w-full sm:max-w-xs">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" onChange={(event) => setSearch(event.target.value)} placeholder="Search events" value={search} />
        </label>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2" role="status">
          {[0, 1, 2, 3].map((item) => <div className="h-48 animate-pulse rounded-2xl bg-white" key={item} />)}
        </div>
      ) : filtered.length === 0 ? (
        <section className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <CalendarDays aria-hidden="true" className="mx-auto size-9 text-slate-300" />
          <h2 className="mt-3 font-semibold">{events.length ? "No matching events" : "Create your first event"}</h2>
          <p className="mt-1 text-sm text-slate-500">{events.length ? "Try another search." : "Draft your event, review the details, then publish when ready."}</p>
          {!events.length && <Link className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white" href="/dashboard/events/new">Create event <ArrowRight aria-hidden="true" className="size-4" /></Link>}
        </section>
      ) : (
        <section aria-label="Managed events" className="mt-5 grid gap-4 xl:grid-cols-2">
          {filtered.map((event) => (
            <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" key={event.id}>
              {event.coverImage && <EventCoverImage alt="" className="h-44 w-full object-cover" fallbackClassName="min-h-28 w-full" src={event.coverImage} />}
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{event.type.replaceAll("_", " ")}</p>
                    <h2 className="mt-2 truncate text-lg font-semibold text-slate-950">{event.title}</h2>
                  </div>
                  <StatusBadge status={event.status} />
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="size-4 text-slate-400" />{formatDate(event.startDate)}</p>
                  <p className="flex items-center gap-2"><MapPin aria-hidden="true" className="size-4 text-slate-400" />{event.location}</p>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-500"><strong className="text-slate-900">{event._count?.registrations ?? 0}</strong> registrations</p>
                  <div className="flex gap-2">
                    {event.status !== "DRAFT" && event.status !== "ARCHIVED" && (
                      <Link aria-label={`View public page for ${event.title}`} className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" href={`/events/${event.slug}`} rel="noreferrer" target="_blank">
                        <ExternalLink aria-hidden="true" className="size-4" />
                      </Link>
                    )}
                    <Link className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100" href={`/dashboard/events/${event.id}`}>
                      View details <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
