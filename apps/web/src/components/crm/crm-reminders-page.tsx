"use client";

import Link from "next/link";
import { Bell, Check, Clock3, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { crmApi, type CrmReminder, type CrmReminderStatus } from "@/lib/crm-api";
import { CrmEmpty, CrmError, CrmHeader, CrmLoading, formatCrmDate, InlineMessage } from "@/components/crm/crm-shared";

type View = "PENDING" | "OVERDUE" | "COMPLETED";
export function CrmRemindersPage() {
  const [view, setView] = useState<View>("PENDING");
  const [items, setItems] = useState<CrmReminder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [editing, setEditing] = useState<CrmReminder | null>(null);

  const cursor = cursorStack.at(-1);
  useEffect(() => {
    let active = true;
    const params = view === "OVERDUE" ? { overdue: true, limit: 30, cursor } : { status: view as CrmReminderStatus, limit: 30, cursor };
    crmApi.listReminders(params).then((page) => { if (active) { setItems(page.items); setNextCursor(page.nextCursor); } }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Could not load reminders."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view, cursor, reload]);

  async function act(reminder: CrmReminder, action: "complete" | "delete") {
    setBusyId(reminder.id); setError(null); setMessage(null);
    try {
      if (action === "complete") { await crmApi.completeReminder(reminder.customerId, reminder.id); setMessage("Reminder completed."); }
      else { if (!window.confirm("Delete this reminder?")) return; await crmApi.deleteReminder(reminder.customerId, reminder.id); setMessage("Reminder deleted."); }
      setReload((value) => value + 1);
    } catch (actionError: unknown) { setError(actionError instanceof Error ? actionError.message : "Could not update reminder."); }
    finally { setBusyId(null); }
  }

  const countsLabel = view === "OVERDUE" ? "Overdue follow-ups" : view === "COMPLETED" ? "Completed follow-ups" : "Pending follow-ups";
  return <main>
    <CrmHeader eyebrow="Customer follow-up" title="Reminders" description="Keep track of customer follow-ups and due dates. Reminders are scoped to each organizer’s customers." />
    {error && <CrmError message={error} onRetry={() => { setLoading(true); setReload((value) => value + 1); }} />}{message && <InlineMessage>{message}</InlineMessage>}
    <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Reminder status"><ViewButton active={view === "PENDING"} onClick={() => { setLoading(true); setCursorStack([undefined]); setView("PENDING"); }}>Pending</ViewButton><ViewButton active={view === "OVERDUE"} onClick={() => { setLoading(true); setCursorStack([undefined]); setView("OVERDUE"); }}>Overdue</ViewButton><ViewButton active={view === "COMPLETED"} onClick={() => { setLoading(true); setCursorStack([undefined]); setView("COMPLETED"); }}>Completed</ViewButton></div>
    <section aria-label={countsLabel} className="mt-4">{loading ? <CrmLoading label="Loading reminders…" /> : items.length === 0 ? <CrmEmpty title={`No ${view.toLowerCase()} reminders`} detail={view === "OVERDUE" ? "There are no pending reminders past their due date." : view === "PENDING" ? "Create a reminder from a customer profile to track a follow-up." : "Completed reminders will be listed here."} /> : <div className="space-y-3">{items.map((reminder) => <ReminderCard overdue={view === "OVERDUE"} busy={busyId === reminder.id} key={reminder.id} onAction={(action) => void act(reminder, action)} onEdit={() => setEditing(reminder)} reminder={reminder} />)}</div>}</section>
    {items.length > 0 && <div className="mt-4 flex items-center justify-between"><button className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40" disabled={cursorStack.length <= 1 || loading} onClick={() => { setLoading(true); setCursorStack((stack) => stack.slice(0, -1)); }} type="button">Previous</button><button className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40" disabled={!nextCursor || loading} onClick={() => { if (nextCursor) { setLoading(true); setCursorStack((stack) => [...stack, nextCursor]); } }} type="button">Load more</button></div>}
    {editing && <EditReminderModal reminder={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage("Reminder updated."); setLoading(true); setReload((value) => value + 1); }} />}
  </main>;
}
function ViewButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button aria-selected={active} className={`h-9 rounded-lg px-3 text-sm font-semibold ${active ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`} onClick={onClick} role="tab" type="button">{children}</button>; }
function ReminderCard({ reminder, busy, overdue, onAction, onEdit }: { reminder: CrmReminder; busy: boolean; overdue: boolean; onAction: (action: "complete" | "delete") => void; onEdit: () => void }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`flex size-9 items-center justify-center rounded-xl ${overdue ? "bg-red-50 text-red-700" : reminder.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>{reminder.status === "COMPLETED" ? <Check className="size-4" /> : overdue ? <Clock3 className="size-4" /> : <Bell className="size-4" />}</span><h2 className="font-semibold text-slate-950">{reminder.title}</h2>{overdue && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">Overdue</span>}</div><p className="mt-3 text-sm text-slate-600">{reminder.description || "No additional details."}</p><p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span>Due {formatCrmDate(reminder.dueAt, true)}</span><span>Assigned to {reminder.assignedTo ? `${reminder.assignedTo.firstName} ${reminder.assignedTo.lastName}` : "Unassigned"}</span></p><Link className="mt-3 inline-block text-sm font-semibold text-indigo-700 hover:underline" href={`/dashboard/crm/customers/${reminder.customer.id}`}>{reminder.customer.firstName} {reminder.customer.lastName} · {reminder.customer.email}</Link></div><div className="flex shrink-0 gap-2 sm:justify-end">{reminder.status === "PENDING" && <><button aria-label={`Edit ${reminder.title}`} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 px-3 text-slate-600 hover:bg-slate-50" disabled={busy} onClick={onEdit} type="button"><Pencil className="size-3.5" /></button><button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={busy} onClick={() => onAction("complete")} type="button"><Check className="size-3.5" />Complete</button></>}<button aria-label={`Delete ${reminder.title}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" disabled={busy} onClick={() => onAction("delete")} type="button"><Trash2 className="size-3.5" />Delete</button></div></div></article>;
}

function EditReminderModal({ reminder, onClose, onSaved }: { reminder: CrmReminder; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(reminder.title);
  const [description, setDescription] = useState(reminder.description ?? "");
  const [dueAt, setDueAt] = useState(new Date(new Date(reminder.dueAt).getTime() - new Date(reminder.dueAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { await crmApi.updateReminder(reminder.customerId, reminder.id, { title, description: description || null, dueAt: new Date(dueAt).toISOString() }); onSaved(); } catch (saveError: unknown) { setError(saveError instanceof Error ? saveError.message : "Could not update reminder."); } finally { setSaving(false); } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5"><section aria-labelledby="edit-reminder-title" aria-modal="true" className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6" role="dialog"><div className="flex items-center justify-between"><h2 className="font-semibold" id="edit-reminder-title">Edit reminder</h2><button aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} type="button"><X className="size-4" /></button></div>{error && <InlineMessage tone="error">{error}</InlineMessage>}<form className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}><label className="block text-sm font-medium text-slate-700">Title<input className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" maxLength={160} onChange={(event) => setTitle(event.target.value)} required value={title} /></label><label className="block text-sm font-medium text-slate-700">Details<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm" maxLength={5000} onChange={(event) => setDescription(event.target.value)} value={description} /></label><label className="block text-sm font-medium text-slate-700">Due date and time<input className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" onChange={(event) => setDueAt(event.target.value)} required type="datetime-local" value={dueAt} /></label><div className="flex justify-end gap-2"><button className="h-9 px-3 text-sm font-semibold text-slate-600" onClick={onClose} type="button">Cancel</button><button className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving || !title.trim()} type="submit">{saving ? "Saving…" : "Save reminder"}</button></div></form></section></div>;
}
