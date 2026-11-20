"use client";

import { Activity, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate, staffApi } from "@/lib/staff-api";

type AuditRecord = {
  id: string;
  actorRole: string;
  method: string;
  route: string;
  resourceId: string | null;
  statusCode: number;
  createdAt: string;
  actor: { firstName: string; lastName: string; email: string } | null;
};

type AuditPage = { items: AuditRecord[]; nextCursor: string | null };

export function AuditLogsPage() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(nextCursor?: string) {
    try {
      const query = nextCursor ? `?limit=50&cursor=${encodeURIComponent(nextCursor)}` : "?limit=50";
      const page = await staffApi<AuditPage>(`/audit-logs${query}`);
      setRecords((current) => nextCursor ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load audit logs.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadPage());
  }, []);

  return (
    <main>
      <header>
        <p className="text-sm font-medium text-indigo-700">Security & accountability</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Audit logs</h1>
        <p className="mt-2 text-sm text-slate-600">
          Successful and rejected changes made by authenticated staff. Request bodies and attendee data are not stored.
        </p>
      </header>
      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      <section aria-label="Staff audit history" className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500" role="status">Loading audit history…</p>
        ) : records.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Activity aria-hidden="true" className="mx-auto size-9 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-900">No changes recorded yet</p>
            <p className="mt-1 text-sm text-slate-500">Authenticated staff changes will appear here.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {records.map((record) => (
                <article className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.3fr)_8rem_10rem]" key={record.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {record.actor ? `${record.actor.firstName} ${record.actor.lastName}` : "Former staff account"}
                    </p>
                    <p className="truncate text-xs text-slate-500">{record.actor?.email ?? record.actorRole.replaceAll("_", " ")}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{record.method} {record.route}</p>
                    {record.resourceId && <p className="mt-1 truncate text-xs text-slate-500">Resource: {record.resourceId}</p>}
                  </div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${record.statusCode < 400 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    HTTP {record.statusCode}
                  </span>
                  <time className="text-xs text-slate-500 sm:text-right">{formatDate(record.createdAt)}</time>
                </article>
              ))}
            </div>
            {cursor && (
              <div className="border-t border-slate-100 p-4 text-center">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={loadingMore}
                  onClick={() => {
                    setLoadingMore(true);
                    void loadPage(cursor);
                  }}
                  type="button"
                >
                  <ChevronDown aria-hidden="true" className="size-4" />
                  {loadingMore ? "Loading…" : "Load older records"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
