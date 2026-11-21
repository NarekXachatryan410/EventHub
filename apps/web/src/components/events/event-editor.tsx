"use client";

import {
  ArrowLeft,
  Check,
  ExternalLink,
  LoaderCircle,
  Save,
  Send,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { StatusBadge } from "@/components/auth/staff-dashboard";
import { EventCoverImage } from "@/components/events/event-cover-image";
import { staffApi, type StaffEvent, type StaffUser } from "@/lib/staff-api";

type EventForm = {
  title: string;
  slug: string;
  description: string;
  type: string;
  location: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  maxAttendees: string;
  coverImage: string;
  contactEmail: string;
  seoTitle: string;
  seoDescription: string;
  registrationEnabled: boolean;
  reminderOffsetsHours: string;
};

const emptyForm: EventForm = {
  title: "",
  slug: "",
  description: "",
  type: "OPEN_DAY",
  location: "",
  startDate: "",
  endDate: "",
  registrationDeadline: "",
  maxAttendees: "",
  coverImage: "",
  contactEmail: "",
  seoTitle: "",
  seoDescription: "",
  registrationEnabled: true,
  reminderOffsetsHours: "24, 2",
};

const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10";
const textAreaClass = "mt-1.5 min-h-32 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10";

export function EventEditor({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [currentEvent, setCurrentEvent] = useState<StaffEvent | null>(null);
  const [checkInStaff, setCheckInStaff] = useState<StaffUser[]>([]);
  const [assignedStaffIds, setAssignedStaffIds] = useState<string[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(Boolean(eventId));

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    staffApi<StaffEvent>(`/events/manage/${eventId}`)
      .then((event) => {
        if (!active) return;
        setCurrentEvent(event);
        setForm(eventToForm(event));
        setAssignedStaffIds(
          event.staffAssignments?.map(({ staff }) => staff.id) ?? [],
        );
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this event.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    staffApi<StaffUser[]>("/events/manage/check-in-staff")
      .then(setCheckInStaff)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load check-in staff.",
        ),
      );
  }, [eventId]);

  function update<K extends keyof EventForm>(key: K, value: EventForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function updateTitle(title: string) {
    setForm((current) => ({
      ...current,
      title,
      ...(!slugEdited ? { slug: slugify(title) } : {}),
    }));
  }

  function eventPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      slug: form.slug.trim().toLowerCase(),
      description: form.description,
      type: form.type,
      location: form.location.trim(),
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      registrationDeadline: new Date(form.registrationDeadline).toISOString(),
      registrationEnabled: form.registrationEnabled,
      reminderOffsetsHours: parseReminderOffsets(form.reminderOffsetsHours),
    };
    if (form.maxAttendees) payload.maxAttendees = Number(form.maxAttendees);
    if (form.coverImage.trim() || eventId) {
      payload.coverImage = form.coverImage.trim() || null;
    }
    if (form.contactEmail.trim()) payload.contactEmail = form.contactEmail.trim();
    if (form.seoTitle.trim()) payload.seoTitle = form.seoTitle.trim();
    if (form.seoDescription.trim()) payload.seoDescription = form.seoDescription.trim();
    return payload;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const deadlineError = validateRegistrationDeadline(form);
    const reminderError = validateReminderOffsets(form.reminderOffsetsHours);
    if (deadlineError || reminderError) {
      setError(deadlineError ?? reminderError);
      setNotice(null);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await staffApi<StaffEvent>(
        eventId ? `/events/${eventId}` : "/events",
        {
          method: eventId ? "PATCH" : "POST",
          body: JSON.stringify(eventPayload()),
        },
      );
      if (!eventId) {
        router.replace(`/dashboard/events/${saved.id}`);
        return;
      }
      setCurrentEvent(saved);
      setNotice("Event details saved.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this event.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(path: string, confirmation: string) {
    if (!eventId || !window.confirm(confirmation)) return;
    setAction(path);
    setError(null);
    setNotice(null);
    try {
      if (path === "cancel" || path === "close-registration") {
        await staffApi<{ success: boolean }>(`/events/${eventId}/${path}`, {
          method: "PATCH",
        });
        router.replace("/dashboard/events");
        router.refresh();
        return;
      }
      const updated = await staffApi<StaffEvent>(`/events/${eventId}/${path}`, { method: "PATCH" });
      setCurrentEvent(updated);
      setNotice(
        path === "complete"
          ? "Event marked completed."
          : path === "cancel"
            ? "Event cancelled."
            : path === "unpublish"
              ? "Event moved back to draft."
              : path === "close-registration"
                ? "Registration closed."
                : path === "archive"
                  ? "Event archived. Registration records were preserved."
                  : path === "restore"
                    ? "Event restored as a draft."
                : "Event published.",
      );
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : "Could not update event status.");
    } finally {
      setAction(null);
    }
  }

  async function saveAssignments() {
    if (!eventId) return;
    setSavingAssignments(true);
    setError(null);
    setNotice(null);
    try {
      await staffApi(`/events/${eventId}/check-in-staff`, {
        method: "PUT",
        body: JSON.stringify({ staffIds: assignedStaffIds }),
      });
      setNotice("Check-in staff assignments saved.");
    } catch (assignmentError: unknown) {
      setError(
        assignmentError instanceof Error
          ? assignmentError.message
          : "Could not save check-in staff assignments.",
      );
    } finally {
      setSavingAssignments(false);
    }
  }

  if (loading) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" role="status">Loading event details…</p>;
  }

  const deadlineError = validateRegistrationDeadline(form);

  return (
    <main className="mx-auto max-w-4xl">
      <Link className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-700" href="/dashboard/events"><ArrowLeft aria-hidden="true" className="size-4" />Back to events</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-700">{eventId ? "Event details" : "New event"}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{eventId ? form.title || "Edit event" : "Create an event"}</h1>
          <p className="mt-2 text-sm text-slate-600">Add the essentials now. You can save a draft and publish when it’s ready.</p>
        </div>
        {currentEvent && <StatusBadge status={currentEvent.status} />}
      </div>

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}

      {currentEvent && (
        <section aria-label="Event actions" className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        {currentEvent.status === "ARCHIVED" ? (
          <ActionButton primary disabled={Boolean(action)} onClick={() => void changeStatus("restore", "Restore this event as a draft?")}><ArrowLeft aria-hidden="true" className="size-4" />Restore to draft</ActionButton>
        ) : currentEvent.status !== "CANCELLED" && currentEvent.status !== "COMPLETED" && (
            <>
              {currentEvent.status === "PUBLISHED" ? (
                <ActionButton disabled={Boolean(action)} onClick={() => void changeStatus("unpublish", "Move this event back to draft?")}><XCircle aria-hidden="true" className="size-4" />Unpublish</ActionButton>
              ) : (
                <ActionButton primary disabled={Boolean(action)} onClick={() => void changeStatus("publish", "Publish this event? It will become publicly visible.")}><Send aria-hidden="true" className="size-4" />Publish</ActionButton>
              )}
              {currentEvent.status === "PUBLISHED" && currentEvent.registrationEnabled && (
                <ActionButton danger disabled={Boolean(action)} onClick={() => void changeStatus("close-registration", "Permanently delete this event and all registrations, tickets, feedback, planning data, and related records? This cannot be undone.")}><XCircle aria-hidden="true" className="size-4" />Close registration & delete</ActionButton>
              )}
              <ActionButton disabled={Boolean(action)} onClick={() => void changeStatus("complete", "Mark this event completed? Registration will be disabled.")}><Check aria-hidden="true" className="size-4" />Mark completed</ActionButton>
              <ActionButton danger disabled={Boolean(action)} onClick={() => void changeStatus("cancel", "Permanently delete this cancelled event and all registrations, tickets, feedback, planning data, and related records? Cancellation emails will still be queued. This cannot be undone.")}><XCircle aria-hidden="true" className="size-4" />Cancel & delete event</ActionButton>
            </>
          )}
          {currentEvent.status !== "ARCHIVED" && (
            <ActionButton disabled={Boolean(action)} onClick={() => void changeStatus("archive", "Archive this event? It will be hidden from public pages, but registration records will be kept.")}><XCircle aria-hidden="true" className="size-4" />Archive</ActionButton>
          )}
          {currentEvent.status !== "DRAFT" && currentEvent.status !== "ARCHIVED" && (
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href={`/events/${currentEvent.slug}`}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              View public page
            </Link>
          )}
          {action && <span className="inline-flex items-center gap-2 px-2 text-sm text-slate-500"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Updating…</span>}
        </section>
      )}

      {eventId && currentEvent && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold">Assigned check-in staff</h2>
          <p className="mt-1 text-sm text-slate-500">Only assigned staff can access this event’s check-in workspace.</p>
          {checkInStaff.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No active Check-in Staff accounts are available.</p>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {checkInStaff.map((member) => (
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm" key={member.id}>
                  <input
                    checked={assignedStaffIds.includes(member.id)}
                    className="size-4 accent-indigo-600"
                    onChange={(input) =>
                      setAssignedStaffIds((current) =>
                        input.target.checked
                          ? [...current, member.id]
                          : current.filter((id) => id !== member.id),
                      )
                    }
                    type="checkbox"
                  />
                  <span><strong className="block font-medium">{member.firstName} {member.lastName}</strong><span className="text-xs text-slate-500">{member.email}</span></span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={savingAssignments}
              onClick={() => void saveAssignments()}
              type="button"
            >
              {savingAssignments ? "Saving…" : "Save assignments"}
            </button>
          </div>
        </section>
      )}

      <form className="mt-5 space-y-6" onSubmit={submit}>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="font-semibold">Event information</h2>
          <p className="mt-1 text-sm text-slate-500">The details attendees will see on the public event page.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Event title<input className={inputClass} maxLength={160} onChange={(event) => updateTitle(event.target.value)} placeholder="e.g. Academy Open Day" required value={form.title} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Public URL slug<div className="mt-1.5 flex h-11 items-center overflow-hidden rounded-xl border border-slate-300 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10"><span className="hidden border-r border-slate-200 bg-slate-50 px-3 text-xs text-slate-500 sm:block">/events/</span><input className="h-full min-w-0 flex-1 px-3 text-sm outline-none" maxLength={180} onChange={(event) => { setSlugEdited(true); update("slug", slugify(event.target.value)); }} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="academy-open-day" required value={form.slug} /></div><span className="mt-1 block text-xs font-normal text-slate-500">Lowercase letters, numbers, and hyphens.</span></label>
            <label className="text-sm font-medium text-slate-700">Event type<select className={inputClass} onChange={(event) => update("type", event.target.value)} value={form.type}><option value="OPEN_DAY">Open Day</option><option value="WORKSHOP">Workshop</option><option value="INFORMATION_SESSION">Information Session</option><option value="GUEST_VISIT">Guest Visit</option><option value="MEETUP">Meetup</option><option value="GRADUATION_CEREMONY">Graduation Ceremony</option><option value="OTHER">Other</option></select></label>
            <label className="text-sm font-medium text-slate-700">Location<input className={inputClass} maxLength={300} onChange={(event) => update("location", event.target.value)} placeholder="Venue, room, or online" required value={form.location} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description<textarea className={textAreaClass} maxLength={100000} onChange={(event) => update("description", event.target.value)} placeholder="Tell attendees what to expect…" required value={form.description} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Cover image URL <span className="font-normal text-slate-400">(optional)</span><input className={inputClass} onChange={(event) => update("coverImage", event.target.value)} placeholder="https://example.com/event-cover.jpg" type="url" value={form.coverImage} />{form.coverImage.trim() && <div className="mt-4"><p className="text-xs font-medium text-slate-500">Image preview</p><EventCoverImage alt={`${form.title || "Event"} cover preview`} className="mt-2 max-h-72 w-full rounded-xl object-cover" fallbackClassName="mt-2 min-h-36 w-full rounded-xl" key={form.coverImage.trim()} src={form.coverImage.trim()} /></div>}</label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="font-semibold">Schedule and registration</h2>
          <p className="mt-1 text-sm text-slate-500">Set times in your local timezone; they’ll be saved consistently.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Starts<input className={inputClass} onChange={(event) => update("startDate", event.target.value)} required type="datetime-local" value={form.startDate} /></label>
            <label className="text-sm font-medium text-slate-700">Ends<input className={inputClass} onChange={(event) => update("endDate", event.target.value)} required type="datetime-local" value={form.endDate} /></label>
            <label className="text-sm font-medium text-slate-700">Registration deadline<input aria-describedby="registration-deadline-help" aria-invalid={Boolean(deadlineError)} className={inputClass} onChange={(event) => update("registrationDeadline", event.target.value)} required type="datetime-local" value={form.registrationDeadline} /><span className={`mt-1 block text-xs font-normal ${deadlineError ? "text-red-700" : "text-slate-500"}`} id="registration-deadline-help">{deadlineError ?? "Choose any date and time. It must be on or before the event starts."}</span></label>
            <label className="text-sm font-medium text-slate-700">Maximum attendees <span className="font-normal text-slate-400">(optional)</span><input className={inputClass} min={1} max={1000000} onChange={(event) => update("maxAttendees", event.target.value)} placeholder="No limit" type="number" value={form.maxAttendees} /></label>
            <label className="text-sm font-medium text-slate-700">Contact email <span className="font-normal text-slate-400">(optional)</span><input className={inputClass} onChange={(event) => update("contactEmail", event.target.value)} type="email" value={form.contactEmail} /></label>
            <label className="text-sm font-medium text-slate-700">Reminder hours before event <span className="font-normal text-slate-400">(comma-separated)</span><input className={inputClass} aria-describedby="reminder-offsets-help" aria-invalid={Boolean(validateReminderOffsets(form.reminderOffsetsHours))} onChange={(event) => update("reminderOffsetsHours", event.target.value)} placeholder="24, 2" value={form.reminderOffsetsHours} /><span className="mt-1 block text-xs font-normal text-slate-500" id="reminder-offsets-help">{validateReminderOffsets(form.reminderOffsetsHours) ?? "Leave blank to disable reminders. Use unique whole hours from 1 to 720."}</span></label>
            <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 p-3.5 text-sm text-slate-700"><input checked={form.registrationEnabled} className="size-4 accent-indigo-600" onChange={(event) => update("registrationEnabled", event.target.checked)} type="checkbox" /><span><strong className="block font-medium">Enable registration</strong><span className="text-xs text-slate-500">Attendees can register while this event is published.</span></span></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="font-semibold">Search appearance</h2>
          <p className="mt-1 text-sm text-slate-500">Optional metadata for search engines and social sharing.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">SEO title<input className={inputClass} maxLength={70} onChange={(event) => update("seoTitle", event.target.value)} value={form.seoTitle} /></label>
            <label className="text-sm font-medium text-slate-700">SEO description<input className={inputClass} maxLength={320} onChange={(event) => update("seoDescription", event.target.value)} value={form.seoDescription} /></label>
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-[#f5f6fa]/95 px-4 py-4 backdrop-blur sm:-mx-7 sm:px-7">
          <Link className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/dashboard/events">Discard</Link>
          <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60" disabled={saving} type="submit">{saving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" />}{saving ? "Saving…" : eventId ? "Save changes" : "Save as draft"}</button>
        </div>
      </form>
    </main>
  );
}

function eventToForm(event: StaffEvent): EventForm {
  return {
    title: event.title,
    slug: event.slug,
    description: event.description,
    type: event.type,
    location: event.location,
    startDate: toDateTimeLocal(event.startDate),
    endDate: toDateTimeLocal(event.endDate),
    registrationDeadline: toDateTimeLocal(event.registrationDeadline),
    maxAttendees: event.maxAttendees?.toString() ?? "",
    coverImage: event.coverImage ?? "",
    contactEmail: event.contactEmail ?? "",
    seoTitle: event.seoTitle ?? "",
    seoDescription: event.seoDescription ?? "",
    registrationEnabled: event.registrationEnabled,
    reminderOffsetsHours: event.reminderOffsetsHours?.join(", ") ?? "24, 2",
  };
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function validateRegistrationDeadline(form: EventForm): string | null {
  if (!form.registrationDeadline) return null;

  const deadline = new Date(form.registrationDeadline);
  if (Number.isNaN(deadline.valueOf())) {
    return "Choose a valid registration deadline.";
  }

  if (form.startDate) {
    const startDate = new Date(form.startDate);
    if (!Number.isNaN(startDate.valueOf()) && deadline > startDate) {
      return "Registration deadline cannot be after the event starts.";
    }
  }

  return null;
}

function parseReminderOffsets(value: string): number[] {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(",").map((offset) => Number(offset.trim())) : [];
}

function validateReminderOffsets(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",").map((offset) => offset.trim());
  if (
    parts.length > 8 ||
    parts.some((part) => !/^\d+$/.test(part) || Number(part) < 1 || Number(part) > 720)
  ) {
    return "Enter up to 8 whole-hour offsets between 1 and 720, or leave blank to disable reminders.";
  }
  if (new Set(parts.map(Number)).size !== parts.length) {
    return "Reminder offsets must be unique.";
  }
  return null;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
}

function ActionButton({
  children,
  onClick,
  primary = false,
  danger = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const style = primary
    ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
    : danger
      ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return <button className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${style}`} disabled={disabled} onClick={onClick} type="button">{children}</button>;
}
