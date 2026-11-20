"use client";

import { Link2, RefreshCw, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate, staffApi } from "@/lib/staff-api";

type CrmSyncRecord = {
  id: string;
  status: "PENDING" | "PROCESSING" | "SYNCED" | "FAILED";
  contactId: string | null;
  leadId: string | null;
  errorMessage: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  syncedAt: string | null;
  updatedAt: string;
  registration: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    event: { id: string; title: string };
    ticket: { checkIn: { checkedInAt: string } | null } | null;
  };
};

type CrmSyncPageData = { items: CrmSyncRecord[]; nextCursor: string | null };

export function CrmSyncPage() {
  const [records, setRecords] = useState<CrmSyncRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(nextCursor?: string) {
    try {
      const query = nextCursor
        ? `?limit=50&cursor=${encodeURIComponent(nextCursor)}`
        : "?limit=50";
      const result = await staffApi<CrmSyncPageData>(`/crm-sync-logs${query}`);
      setRecords((current) => nextCursor ? [...current, ...result.items] : result.items);
      setCursor(result.nextCursor);
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load CRM sync logs.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, []);

  async function retry(id: string) {
    setRetryingId(id);
    try {
      await staffApi<{ success: boolean }>(`/crm-sync-logs/${id}/retry`, {
        method: "POST",
      });
      await load();
    } catch (retryError: unknown) {
      setError(retryError instanceof Error ? retryError.message : "Could not retry CRM sync.");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <main>
      <header>
        <p className="text-sm font-medium text-indigo-700">External integrations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">CRM synchronization</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Registration and check-in updates are sent through the configured Navigator-compatible upsert endpoint. Failed deliveries remain visible and can be retried.
        </p>
      </header>
      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      <section aria-label="CRM synchronization history" className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500" role="status">Loading CRM sync records…</p>
        ) : records.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Users aria-hidden="true" className="mx-auto size-9 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-900">No registrations to synchronize yet</p>
            <p className="mt-1 text-sm text-slate-500">New and existing registration syncs will appear here.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {records.map((record) => (
                <article className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_10rem_auto]" key={record.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{record.registration.firstName} {record.registration.lastName}</p>
                    <p className="truncate text-xs text-slate-500">{record.registration.email}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{record.registration.event.title}</p>
                  </div>
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${record.status === "SYNCED" ? "bg-emerald-50 text-emerald-700" : record.status === "FAILED" ? "bg-red-50 text-red-700" : record.status === "PROCESSING" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>
                      {record.status}
                    </span>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {record.registration.ticket?.checkIn
                        ? `Attended ${formatDate(record.registration.ticket.checkIn.checkedInAt)}`
                        : `Registration ${record.registration.status.toLowerCase()}`}
                    </p>
                    {record.status === "FAILED" && record.errorMessage && (
                      <p className="mt-1 line-clamp-2 text-xs text-red-700">{record.errorMessage}</p>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    <p>{record.attempts} attempt{record.attempts === 1 ? "" : "s"}</p>
                    {record.syncedAt && <p className="mt-1">Synced {formatDate(record.syncedAt)}</p>}
                    {record.contactId && <p className="mt-1 truncate">CRM contact {record.contactId}</p>}
                  </div>
                  <div className="flex items-start sm:justify-end">
                    {record.status === "FAILED" && (
                      <button
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        disabled={retryingId === record.id}
                        onClick={() => retry(record.id)}
                        type="button"
                      >
                        <RefreshCw aria-hidden="true" className={`size-3.5 ${retryingId === record.id ? "animate-spin" : ""}`} />
                        {retryingId === record.id ? "Retrying…" : "Retry"}
                      </button>
                    )}
                    {record.status === "SYNCED" && (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Link2 aria-hidden="true" className="size-3.5" /> Linked
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {cursor && (
              <div className="border-t border-slate-100 p-4 text-center">
                <button
                  className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={loadingMore}
                  onClick={() => {
                    setLoadingMore(true);
                    void load(cursor);
                  }}
                  type="button"
                >
                  {loadingMore ? "Loading…" : "Load older syncs"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
