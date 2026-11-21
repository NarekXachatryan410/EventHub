"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, ContactRound, TicketCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { crmApi } from "@/lib/crm-api";
import { CrmEmpty, CrmError, CrmHeader, CrmLoading } from "@/components/crm/crm-shared";

type DashboardData = Awaited<ReturnType<typeof crmApi.dashboardAnalytics>>;
export function CrmDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    crmApi.dashboardAnalytics().then((result) => { if (active) setData(result); }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Could not load CRM dashboard analytics."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  const trend = useMemo(() => data?.customerGrowth.map((row) => ({ ...row, label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(row.month)) })) ?? [], [data]);
  const max = Math.max(1, ...trend.map((point) => point.customers));
  const metrics = data ? [
    { label: "Customers", value: data.totalCustomers, detail: `${data.archivedCustomers.toLocaleString()} archived`, icon: UsersRound },
    { label: "Active customers", value: data.activeCustomers, detail: "Not archived", icon: ContactRound },
    { label: "Registered attendees", value: data.registeredCustomers, detail: `${data.registrations.toLocaleString()} linked registrations`, icon: TicketCheck },
    { label: "Added this month", value: data.createdThisMonth, detail: "Based on customer record creation dates", icon: CalendarClock },
  ] : [];
  return <main>
    <CrmHeader eyebrow="Customer relationships" title="CRM overview" description="A live view of customer records, registration relationships, and customer growth for your organizer." action={<Link className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700" href="/dashboard/crm/customers">Browse customers<ArrowRight aria-hidden="true" className="size-4" /></Link>} />
    {error && <CrmError message={error} onRetry={() => { setLoading(true); setError(null); setReload((value) => value + 1); }} />}
    {loading ? <CrmLoading label="Loading live CRM analytics…" /> : data?.totalCustomers === 0 ? <div className="mt-7"><CrmEmpty title="No CRM customers yet" detail="Customers appear here when registrations are linked or when you create a customer record." /></div> : data && <>
      <section aria-label="CRM metrics" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, detail, icon: Icon }) => <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={label}><div className="flex justify-between gap-3"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value.toLocaleString()}</p></div><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Icon aria-hidden="true" className="size-5" /></span></div><p className="mt-2 text-xs text-slate-500">{detail}</p></article>)}</section>
      <section aria-labelledby="crm-growth-title" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="font-semibold text-slate-950" id="crm-growth-title">Customer growth</h2><p className="mt-1 text-sm text-slate-500">New CRM customer records by month · last 12 months</p></div><div className="mt-6 grid h-52 grid-cols-6 items-end gap-2 sm:grid-cols-12 sm:gap-3">{trend.map((point) => <div className="flex h-full min-w-0 flex-col items-center justify-end gap-2" key={point.month}><span className="text-[10px] font-medium text-slate-500">{point.customers || ""}</span><div aria-label={`${point.customers} customers added in ${point.label}`} className="w-full min-w-2 rounded-t-md bg-indigo-500" role="img" style={{ height: `${point.customers ? Math.max(7, (point.customers / max) * 100) : 2}%` }} /><span className="text-[10px] text-slate-400">{point.label}</span></div>)}</div></section>
      <section className="mt-6 grid gap-4 md:grid-cols-3"><QuickLink href="/dashboard/crm/customers" title="Customer directory" detail="Search, filter, and manage profiles" /><QuickLink href="/dashboard/crm/segments" title="Customer segments" detail="Build audiences from registration data" /><QuickLink href="/dashboard/crm/reminders" title="Follow-up reminders" detail="Review due and overdue follow-ups" /></section>
    </>}
  </main>;
}
function QuickLink({ href, title, detail }: { href: string; title: string; detail: string }) { return <Link className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md" href={href}><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">{title}</h2><ArrowRight aria-hidden="true" className="size-4 text-indigo-600 transition group-hover:translate-x-1" /></div><p className="mt-2 text-sm text-slate-500">{detail}</p></Link>; }
