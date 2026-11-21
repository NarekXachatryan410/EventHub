"use client";

import Link from "next/link";
import { ArrowDownUp, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { crmApi, type CrmCustomer, type CrmCustomerPage, type CrmTag, type StaffOrganizer } from "@/lib/crm-api";
import { CrmEmpty, CrmError, CrmHeader, CrmLoading, formatCrmDate, InlineMessage, OrganizerPicker, useOrganizerScope } from "@/components/crm/crm-shared";

export function CrmCustomersPage() {
  const scope = useOrganizerScope();
  const [page, setPage] = useState<CrmCustomerPage | null>(null);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [tagId, setTagId] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!scope.organizerId) return;
    let active = true;
    crmApi.listTags(scope.organizerId).then((result) => { if (active) setTags(result); }).catch(() => { if (active) setTags([]); });
    return () => { active = false; };
  }, [scope.organizerId]);

  const cursor = cursorStack.at(-1);
  useEffect(() => {
    let active = true;
    crmApi.listCustomers({ limit: 25, cursor, search: search || undefined, status: status || undefined, tagId: tagId || undefined, sortBy, sortOrder })
      .then((result) => { if (active) setPage(result); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Could not load customers."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, search, status, tagId, sortBy, sortOrder, reload]);

  function resetFilters() { setCursorStack([undefined]); setSearch(""); setSearchText(""); setStatus(""); setTagId(""); }

  return <main>
    <CrmHeader eyebrow="Customer relationships" title="Customers" description="Search and manage organizer customer profiles, registration relationships, and follow-ups." action={<button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700" onClick={() => setCreateOpen(true)} type="button"><Plus aria-hidden="true" className="size-4" />Add customer</button>} />
    {scope.error && <CrmError message={scope.error} />}
    {scope.user?.role === "SUPER_ADMIN" && <div className="mt-5"><OrganizerPicker organizers={scope.organizers} value={scope.organizerId} onChange={(value) => { scope.setOrganizerId(value); setTagId(""); }} disabled={scope.loading} /></div>}
    {error && <CrmError message={error} onRetry={() => setReload((value) => value + 1)} />}
    <section aria-label="Customer filters" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_200px_170px_auto]" onSubmit={(event: FormEvent) => { event.preventDefault(); setLoading(true); setError(null); setCursorStack([undefined]); setSearch(searchText.trim()); }}>
        <label className="relative block"><span className="sr-only">Search customers</span><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" onChange={(event) => setSearchText(event.target.value)} placeholder="Name, email, or phone" value={searchText} /></label>
        <select aria-label="Customer status" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => { setLoading(true); setCursorStack([undefined]); setStatus(event.target.value); }} value={status}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>
        <select aria-label="Customer tag" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => { setLoading(true); setCursorStack([undefined]); setTagId(event.target.value); }} value={tagId}><option value="">All tags</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
        <div className="flex gap-1"><select aria-label="Sort customers by" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm" onChange={(event) => { setLoading(true); setCursorStack([undefined]); setSortBy(event.target.value); }} value={sortBy}><option value="createdAt">Created date</option><option value="name">Name</option></select><button aria-label={`Sort ${sortOrder === "desc" ? "ascending" : "descending"}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50" onClick={() => { setLoading(true); setCursorStack([undefined]); setSortOrder(sortOrder === "desc" ? "asc" : "desc"); }} type="button"><ArrowDownUp aria-hidden="true" className="size-4" /></button></div>
        <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700" type="submit">Search</button>
      </form>
      {(search || status || tagId) && <button className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={() => { resetFilters(); setLoading(true); }} type="button"><X aria-hidden="true" className="size-3.5" />Clear filters</button>}
    </section>
    <section aria-label="Customer results" className="mt-5">
      {loading ? <CrmLoading label="Loading customer page…" /> : page?.items.length ? <>
        <div className="mb-3 flex items-center justify-between text-sm text-slate-500"><span>{page.items.length} customers on this page</span><span>Sorted {sortOrder === "desc" ? "newest first" : "oldest first"}</span></div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Customer</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Registrations</th><th className="px-4 py-3">Notes</th><th className="px-5 py-3">Added</th></tr></thead><tbody className="divide-y divide-slate-100">{page.items.map((customer) => <CustomerRow customer={customer} key={customer.id} />)}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between"><button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-40" disabled={cursorStack.length <= 1 || loading} onClick={() => { setLoading(true); setCursorStack((stack) => stack.slice(0, -1)); }} type="button"><ChevronLeft aria-hidden="true" className="size-4" />Previous</button><button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-40" disabled={!page.nextCursor || loading} onClick={() => page.nextCursor && (setLoading(true), setCursorStack((stack) => [...stack, page.nextCursor!]))} type="button">Next<ChevronRight aria-hidden="true" className="size-4" /></button></div>
      </> : <CrmEmpty title={search || status || tagId ? "No customers match these filters" : "No customers yet"} detail={search || status || tagId ? "Try a different search or clear some filters." : "Create a customer record or connect an event registration to get started."} />}
    </section>
    {createOpen && <CreateCustomerModal organizers={scope.organizers} organizerId={scope.organizerId} isAdmin={scope.user?.role === "SUPER_ADMIN"} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); setCursorStack([undefined]); setLoading(true); setReload((value) => value + 1); }} />}
  </main>;
}

function CustomerRow({ customer }: { customer: CrmCustomer }) {
  return <tr className="hover:bg-slate-50/70"><td className="px-5 py-4"><Link className="font-semibold text-indigo-700 hover:underline" href={`/dashboard/crm/customers/${customer.id}`}>{customer.firstName} {customer.lastName}</Link><p className="mt-0.5 text-xs text-slate-500">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${customer.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{customer.status === "ACTIVE" ? "Active" : "Archived"}</span></td><td className="px-4 py-4 text-slate-700">{customer._count?.registrations ?? 0}</td><td className="px-4 py-4 text-slate-700">{customer._count?.notes ?? 0}</td><td className="px-5 py-4 text-slate-500">{formatCrmDate(customer.createdAt)}</td></tr>;
}

function CreateCustomerModal({ organizers, organizerId, isAdmin, onClose, onCreated }: { organizers: StaffOrganizer[]; organizerId: string; isAdmin: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", birthday: "" });
  const [owner, setOwner] = useState(organizerId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { await crmApi.createCustomer({ ...form, phone: form.phone || undefined, birthday: form.birthday || undefined, organizerId: isAdmin ? owner : undefined }); onCreated(); } catch (saveError: unknown) { setError(saveError instanceof Error ? saveError.message : "Could not create customer."); } finally { setSaving(false); } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-labelledby="create-customer-title" aria-modal="true" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-7" role="dialog"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-indigo-700">CRM directory</p><h2 className="mt-1 text-xl font-semibold" id="create-customer-title">Add a customer</h2></div><button aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} type="button"><X className="size-4" /></button></div>
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>{isAdmin && <OrganizerPicker organizers={organizers} value={owner} onChange={setOwner} />}<div className="grid gap-4 sm:grid-cols-2"><Field label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required /><Field label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required /><Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required /><Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} /><Field label="Birthday" type="date" value={form.birthday} onChange={(birthday) => setForm({ ...form, birthday })} /></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">Cancel</button><button className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving || (isAdmin && !owner)} type="submit">{saving ? "Saving…" : "Create customer"}</button></div></form></section></div>;
}
function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} /></label>;
}
