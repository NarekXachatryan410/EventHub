"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, ContactRound, TicketCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { crmApi, type CrmCustomer } from "@/lib/crm-api";
import { CrmEmpty, CrmError, CrmHeader, CrmLoading } from "@/components/crm/crm-shared";

export function CrmDashboard() {
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    async function loadAll() {
      setLoading(true); setError(null);
      try {
        const all: CrmCustomer[] = [];
        let cursor: string | undefined;
        do {
          const page = await crmApi.listCustomers({ limit: 100, cursor });
          all.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        if (active) setCustomers(all);
      } catch (loadError: unknown) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load CRM dashboard data.");
      } finally { if (active) setLoading(false); }
    }
    void loadAll();
    return () => { active = false; };
  }, [reload]);

  const metrics = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const active = customers.filter((customer) => customer.status === "ACTIVE").length;
    const knownAttendees = customers.filter((customer) => (customer._count?.registrations ?? 0) > 0).length;
    const registrations = customers.reduce((total, customer) => total + (customer._count?.registrations ?? 0), 0);
    const createdThisMonth = customers.filter((customer) => new Date(customer.createdAt) >= monthStart).length;
    const trend = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (11 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return { key, label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date), count: customers.filter((customer) => customer.createdAt.slice(0, 7) === key).length };
    });
    return { total: customers.length, active, knownAttendees, registrations, createdThisMonth, trend };
  }, [customers]);
  const max = Math.max(1, ...metrics.trend.map((item) => item.count));

  return <main>
    <CrmHeader eyebrow="Customer relationships" title="CRM overview" description="A live view of your organizer’s customer records, registration history, and follow-up workload." action={<Link className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700" href="/dashboard/crm/customers">Browse customers<ArrowRight aria-hidden="true" className="size-4" /></Link>} />
    {error && <CrmError message={error} onRetry={() => setReload((value) => value + 1)} />}
    {loading ? <CrmLoading label="Loading customer records for live metrics…" /> : customers.length === 0 ? <div className="mt-7"><CrmEmpty title="No CRM customers yet" detail="Customers appear here when registrations are linked or when you create a customer record." /></div> : <>
      <section aria-label="CRM metrics" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Customers" value={metrics.total} detail={`${metrics.createdThisMonth} added this month`} icon={<UsersRound className="size-5" />} />
        <Metric label="Active customers" value={metrics.active} detail="Not archived" icon={<ContactRound className="size-5" />} />
        <Metric label="Registered attendees" value={metrics.knownAttendees} detail={`${metrics.registrations.toLocaleString()} total registrations`} icon={<TicketCheck className="size-5" />} />
        <Metric label="Added this month" value={metrics.createdThisMonth} detail="Based on customer record creation dates" icon={<CalendarClock className="size-5" />} />
      </section>
      <section aria-labelledby="crm-growth-title" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="font-semibold text-slate-950" id="crm-growth-title">Customer growth</h2><p className="mt-1 text-sm text-slate-500">New CRM customer records by month · last 12 months</p></div>
        <div className="mt-6 grid h-52 grid-cols-6 items-end gap-2 sm:grid-cols-12 sm:gap-3">{metrics.trend.map((point) => <div className="flex h-full min-w-0 flex-col items-center justify-end gap-2" key={point.key}><span className="text-[10px] font-medium text-slate-500">{point.count || ""}</span><div aria-label={`${point.count} customers added in ${point.label}`} className="w-full min-w-2 rounded-t-md bg-indigo-500" role="img" style={{ height: `${point.count ? Math.max(7, (point.count / max) * 100) : 2}%` }} /><span className="text-[10px] text-slate-400">{point.label}</span></div>)}</div>
      </section>
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <QuickLink href="/dashboard/crm/customers" title="Customer directory" detail="Search, filter, and manage profiles" />
        <QuickLink href="/dashboard/crm/segments" title="Customer segments" detail="Build audiences from registration data" />
        <QuickLink href="/dashboard/crm/reminders" title="Follow-up reminders" detail="Review due and overdue follow-ups" />
      </section>
    </>}
  </main>;
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value.toLocaleString()}</p></div><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">{icon}</span></div><p className="mt-2 text-xs text-slate-500">{detail}</p></article>;
}
function QuickLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return <Link className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md" href={href}><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">{title}</h2><ArrowRight aria-hidden="true" className="size-4 text-indigo-600 transition group-hover:translate-x-1" /></div><p className="mt-2 text-sm text-slate-500">{detail}</p></Link>;
}
