"use client";

import { Mail, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { staffApi, formatDate, type StaffEmailLog } from "@/lib/staff-api";

const statuses = ["ALL", "PENDING", "SENT", "FAILED", "CANCELLED"] as const;

export function EmailLogsPage() {
  const [logs, setLogs] = useState<StaffEmailLog[]>([]);
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const query = status === "ALL" ? "" : `?status=${status}`;
      setLogs(await staffApi<StaffEmailLog[]>(`/email-logs${query}`));
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load email logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => { void Promise.resolve().then(loadLogs); }, [loadLogs]);

  const visible = logs.filter((log) => {
    const term = search.trim().toLowerCase();
    return !term ||
      log.registration.event.title.toLowerCase().includes(term) ||
      log.registration.email.toLowerCase().includes(term) ||
      log.type.toLowerCase().includes(term);
  });

  return (
    <main>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-indigo-700">Communication</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Email Logs</h1><p className="mt-2 text-sm text-slate-600">Delivery status for event confirmations and automated messages.</p></div>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={refreshing} onClick={() => { setRefreshing(true); void loadLogs(); }} type="button"><RefreshCw aria-hidden="true" className={`size-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
      </div>
      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-label="Filter by delivery status" className="flex flex-wrap gap-2">
          {statuses.map((item) => <button aria-pressed={status === item} className={`rounded-lg px-3 py-2 text-xs font-semibold ${status === item ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`} key={item} onClick={() => { setLoading(true); setStatus(item); }} type="button">{item === "ALL" ? "All statuses" : item}</button>)}
        </div>
        <label className="relative block w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" onChange={(event) => setSearch(event.target.value)} placeholder="Search recipients or events" value={search} /></label>
      </div>
      <section aria-label="Email delivery logs" className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="px-5 py-12 text-center text-sm text-slate-500" role="status">Loading email logs…</p> : visible.length === 0 ? <div className="px-5 py-14 text-center"><Mail aria-hidden="true" className="mx-auto size-9 text-slate-300" /><p className="mt-3 font-semibold">{logs.length ? "No matching email logs" : "No emails queued yet"}</p><p className="mt-1 text-sm text-slate-500">New delivery attempts appear here when registrations and reminders are processed.</p></div> : (
          <div className="divide-y divide-slate-100">
            {visible.map((log) => <article className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.7fr)_8rem_10rem]" key={log.id}>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{log.registration.event.title}</p><p className="mt-1 truncate text-sm text-slate-600">{log.registration.email}</p><p className="mt-1 text-xs text-slate-400">{log.type.replaceAll("_", " ")}</p></div>
              <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${log.status === "SENT" ? "bg-emerald-50 text-emerald-700" : log.status === "FAILED" ? "bg-red-50 text-red-700" : log.status === "CANCELLED" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{log.status}</span><p className="mt-1.5 text-xs text-slate-500">{log.attempts} attempt{log.attempts === 1 ? "" : "s"}</p>{log.status === "FAILED" && log.errorMessage && <p className="mt-1 line-clamp-2 text-xs text-red-700">{log.errorMessage}</p>}</div>
              <p className="text-xs text-slate-500 sm:pt-1.5">{log.sentAt ? `Sent ${formatDate(log.sentAt)}` : `Queued ${formatDate(log.createdAt)}`}</p>
              <p className="text-xs text-slate-500 sm:text-right sm:pt-1.5">{log.scheduledAt > log.createdAt ? `Scheduled ${formatDate(log.scheduledAt)}` : "Immediate"}</p>
            </article>)}
          </div>
        )}
      </section>
      <p className="mt-3 text-xs text-slate-500">Showing at most the 100 most recent records. Sensitive email payload contents are never exposed here.</p>
    </main>
  );
}
