"use client";

import {
  Download,
  Search,
  TicketCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { staffApi, formatDate, type StaffEvent, type StaffRegistration } from "@/lib/staff-api";
import { publicApiBaseUrl } from "@/lib/api";

export function RegistrationsPage() {
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [registrations, setRegistrations] = useState<StaffRegistration[]>([]);
  const [total, setTotal] = useState(0);
  const [eventTotal, setEventTotal] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    staffApi<StaffEvent[]>("/events/manage")
      .then((result) => {
        if (!active) return;
        setEvents(result);
        if (result[0]) {
          setLoadingRegistrations(true);
          setEventId(result[0].id);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load events.");
      })
      .finally(() => {
        if (active) setLoadingEvents(false);
      });
    return () => { active = false; };
  }, []);

  const loadRegistrations = useCallback(async () => {
    if (!eventId) return;
    const sequence = ++requestSequence.current;
    setLoadingRegistrations(true);
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (search.trim()) query.set("search", search.trim());
      const result = await staffApi<{
        items: StaffRegistration[];
        total: number;
        eventTotal: number;
        confirmedCount: number;
        checkedInCount: number;
        nextCursor: string | null;
      }>(`/events/${eventId}/registrations/page?${query}`);
      if (sequence !== requestSequence.current) return;
      setRegistrations(result.items);
      setTotal(result.total);
      setEventTotal(result.eventTotal);
      setConfirmedCount(result.confirmedCount);
      setCheckedInCount(result.checkedInCount);
      setNextCursor(result.nextCursor);
      setError(null);
    } catch (loadError: unknown) {
      if (sequence === requestSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load registrations.");
      }
    } finally {
      if (sequence === requestSequence.current) setLoadingRegistrations(false);
    }
  }, [eventId, search]);

  useEffect(() => {
    void Promise.resolve().then(loadRegistrations);
  }, [loadRegistrations]);

  async function loadMore() {
    if (!eventId || !nextCursor) return;
    const sequence = ++requestSequence.current;
    setLoadingMore(true);
    try {
      const query = new URLSearchParams({ limit: "50", cursor: nextCursor });
      if (search.trim()) query.set("search", search.trim());
      const result = await staffApi<{
        items: StaffRegistration[];
        total: number;
        nextCursor: string | null;
      }>(`/events/${eventId}/registrations/page?${query}`);
      if (sequence !== requestSequence.current) return;
      setRegistrations((current) => [...current, ...result.items]);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    } catch (loadError: unknown) {
      if (sequence === requestSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load more registrations.");
      }
    } finally {
      if (sequence === requestSequence.current) setLoadingMore(false);
    }
  }

  async function exportCsv() {
    if (!eventId) return;
    setExporting(true);
    setError(null);
    try {
      const response = await fetch(`${publicApiBaseUrl}/api/events/${eventId}/registrations/export`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? `Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `event-${eventId}-registrations.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError: unknown) {
      setError(exportError instanceof Error ? exportError.message : "Could not export registrations.");
    } finally {
      setExporting(false);
    }
  }

  const event = events.find((item) => item.id === eventId);

  return (
    <main>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-indigo-700">Attendees</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Registrations</h1>
          <p className="mt-2 text-sm text-slate-600">View attendee lists, check-in status, and export event records.</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={!eventId || exporting} onClick={() => void exportCsv()} type="button">
          <Download aria-hidden="true" className="size-4" />{exporting ? "Preparing…" : "Export CSV"}
        </button>
      </div>

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block max-w-xl text-sm font-medium text-slate-700">Select event
          <select className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" disabled={loadingEvents || events.length === 0} onChange={(input) => { setRegistrations([]); setLoadingRegistrations(true); setEventId(input.target.value); }} value={eventId}>
            {events.length === 0 && <option value="">{loadingEvents ? "Loading events…" : "No events available"}</option>}
            {events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      </section>

      {event && (
        <section aria-label="Registration summary" className="mt-4 grid gap-4 sm:grid-cols-3">
          <Metric label="Total registrations" value={eventTotal} icon={<Users aria-hidden="true" className="size-5" />} />
          <Metric label="Confirmed" value={confirmedCount} icon={<TicketCheck aria-hidden="true" className="size-5" />} />
          <Metric label="Checked in" value={checkedInCount} icon={<TicketCheck aria-hidden="true" className="size-5" />} />
        </section>
      )}

      <section aria-labelledby="attendee-list-title" className="mt-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-semibold" id="attendee-list-title">{event?.title ?? "Attendee list"}</h2>
            <p className="mt-1 text-sm text-slate-500">{loadingRegistrations ? "Loading attendees…" : search.trim() ? `${total} matching attendee${total === 1 ? "" : "s"} · showing ${registrations.length}` : `${eventTotal} attendee${eventTotal === 1 ? "" : "s"} · showing ${registrations.length}`}</p>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" onChange={(input) => setSearch(input.target.value)} placeholder="Search name, email, organization" value={search} />
          </label>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Attendee</th><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Registered</th><th className="px-4 py-3">Status</th><th className="px-5 py-3">Check-in</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingRegistrations ? (
                <tr><td className="px-5 py-12 text-center text-slate-500" colSpan={5}>Loading attendee records…</td></tr>
              ) : registrations.length === 0 ? (
                <tr><td className="px-5 py-12 text-center text-slate-500" colSpan={5}>{search.trim() ? "No registrations match this search." : "No registrations for this event yet."}</td></tr>
              ) : registrations.map((registration) => (
                <tr className="hover:bg-slate-50/70" key={registration.id}>
                  <td className="px-5 py-4"><p className="font-semibold text-slate-900">{registration.firstName} {registration.lastName}</p><p className="mt-0.5 text-xs text-slate-500">{registration.email}{registration.phone ? ` · ${registration.phone}` : ""}</p></td>
                  <td className="px-4 py-4 text-slate-600">{registration.organization || "—"}</td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(registration.registeredAt)}</td>
                  <td className="px-4 py-4"><Badge status={registration.status} /></td>
                  <td className="px-5 py-4">{registration.ticket?.checkIn ? <span className="font-medium text-emerald-700">{formatDate(registration.ticket.checkIn.checkedInAt)}</span> : <span className="text-slate-400">Not checked in</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <div className="mt-4 text-center">
            <button
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={loadingMore || loadingRegistrations}
              onClick={() => void loadMore()}
              type="button"
            >
              {loadingMore ? "Loading…" : `Load more (${registrations.length} of ${total})`}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <article className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">{icon}</span></article>;
}

function Badge({ status }: { status: string }) {
  const style = status === "CONFIRMED" ? "bg-emerald-50 text-emerald-700" : status === "CANCELLED" ? "bg-red-50 text-red-700" : status === "WAITLISTED" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{status}</span>;
}
