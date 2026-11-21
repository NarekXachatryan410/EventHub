"use client";

import { AlertCircle, LoaderCircle, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { crmApi, type StaffOrganizer } from "@/lib/crm-api";
import { useStaffUser } from "@/components/auth/staff-shell";

export function CrmHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-indigo-700">{eyebrow}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p></div>{action}</header>;
}

export function CrmError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="mt-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert"><span className="flex items-start gap-2"><AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{message}</span>{onRetry && <button className="self-start font-semibold underline sm:self-auto" onClick={onRetry} type="button">Try again</button>}</div>;
}

export function CrmLoading({ label = "Loading CRM data…" }: { label?: string }) {
  return <div className="mt-7 flex min-h-44 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500" role="status"><LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />{label}</div>;
}

export function CrmEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Users aria-hidden="true" className="size-5" /></span><h3 className="mt-4 font-semibold text-slate-900">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{detail}</p></div>;
}

export function useOrganizerScope() {
  const user = useStaffUser();
  const [organizers, setOrganizers] = useState<StaffOrganizer[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(user?.role === "SUPER_ADMIN");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (user?.role !== "SUPER_ADMIN") return;
    let active = true;
    crmApi.listOrganizers().then((rows) => {
      if (!active) return;
      const allowed = rows.filter((row) => row.isActive && ["EVENT_MANAGER", "SUPER_ADMIN"].includes(row.role));
      setOrganizers(allowed);
      setSelected(allowed.find((row) => row.role === "EVENT_MANAGER")?.id ?? allowed[0]?.id ?? "");
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load organizer accounts.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.role]);
  return { user, organizers, organizerId: user?.role === "SUPER_ADMIN" ? selected : user?.id ?? "", setOrganizerId: setSelected, loading, error };
}

export function OrganizerPicker({ organizers, value, onChange, disabled = false }: { organizers: StaffOrganizer[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="block min-w-56 text-sm font-medium text-slate-700">Organizer<select className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" disabled={disabled || organizers.length === 0} onChange={(event) => onChange(event.target.value)} value={value}><option value="">Choose an organizer…</option>{organizers.map((organizer) => <option key={organizer.id} value={organizer.id}>{organizer.firstName} {organizer.lastName} · {organizer.role === "SUPER_ADMIN" ? "Super Admin" : "Event Manager"}</option>)}</select></label>;
}

export function formatCrmDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat(undefined, includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

export function InlineMessage({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "error" }) {
  return <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}
