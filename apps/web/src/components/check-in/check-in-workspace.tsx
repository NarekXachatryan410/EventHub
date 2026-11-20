"use client";

import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  LoaderCircle,
  QrCode,
  Search,
  TicketCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { staffApi, formatDate, type StaffEvent, type StaffRegistration } from "@/lib/staff-api";

type CheckInRecord = {
  id: string;
  checkedInAt: string;
  ticket: { registration: { id: string; firstName: string; lastName: string; email: string } };
  staff: { firstName: string; lastName: string };
};

const scannerFormats: Html5QrcodeSupportedFormats[] = [Html5QrcodeSupportedFormats.QR_CODE];

export function CheckInWorkspace() {
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [attendees, setAttendees] = useState<StaffRegistration[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([]);
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);
  const inFlightRef = useRef(false);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    staffApi<StaffEvent[]>("/events/manage")
      .then((result) => {
        if (!active) return;
        setEvents(result);
        const requestedId = new URLSearchParams(window.location.search).get("eventId");
        setEventId(result.find((event) => event.id === requestedId)?.id ?? result[0]?.id ?? "");
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Could not load assigned events."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadEventRecords = useCallback(async () => {
    if (!eventId) return;
    try {
      const [registrations, rows] = await Promise.all([
        staffApi<StaffRegistration[]>(`/events/${eventId}/registrations`),
        staffApi<CheckInRecord[]>(`/events/${eventId}/check-ins`),
      ]);
      setAttendees(registrations);
      setCheckIns(rows);
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load event check-in records.");
    }
  }, [eventId]);

  useEffect(() => {
    void Promise.resolve().then(loadEventRecords);
  }, [loadEventRecords]);

  const stopScanner = useCallback(async () => {
    scanningRef.current = false;
    setScanning(false);
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner?.isScanning) {
      await scanner.stop().catch(() => undefined);
    }
    scanner?.clear();
  }, []);

  const checkInToken = useCallback(async (token: string) => {
    if (!eventId || inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting("scan");
    setError(null);
    setMessage(null);
    try {
      const result = await staffApi<{
        success: boolean;
        checkedInAt: string;
        attendee: { id: string; firstName: string; lastName: string };
      }>(`/events/${eventId}/check-in`, {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setMessage(`${result.attendee.firstName} ${result.attendee.lastName} checked in successfully.`);
      await loadEventRecords();
      if (messageTimer.current) clearTimeout(messageTimer.current);
      messageTimer.current = setTimeout(() => setMessage(null), 6000);
    } catch (checkError: unknown) {
      const text = checkError instanceof Error ? checkError.message : "Ticket could not be checked in.";
      setError(text);
    } finally {
      setSubmitting(null);
      inFlightRef.current = false;
    }
  }, [eventId, loadEventRecords]);

  async function startScanner() {
    setScannerError(null);
    setError(null);
    try {
      await stopScanner();
      const scanner = new Html5Qrcode("eventhub-qr-scanner", {
        formatsToSupport: scannerFormats,
        verbose: false,
      });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => {
          if (!scanningRef.current || inFlightRef.current) return;
          scanningRef.current = false;
          setScanning(false);
          void (async () => {
            await stopScanner();
            await checkInToken(decodedText);
          })();
        },
        () => undefined,
      );
      scanningRef.current = true;
      setScanning(true);
    } catch (startError: unknown) {
      await stopScanner();
      if (
        startError instanceof Error &&
        ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(
          startError.name,
        )
      ) {
        setScannerError(
          "Camera access is blocked. Allow camera permission for this site in your browser settings, then try again. You can also use manual check-in below.",
        );
      } else {
        setScannerError(
          startError instanceof Error
            ? `Camera unavailable: ${startError.message}`
            : "Camera access is unavailable. Use manual check-in below.",
        );
      }
    }
  }

  useEffect(() => () => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    const scanner = scannerRef.current;
    if (scanner?.isScanning) void scanner.stop().catch(() => undefined);
    scanner?.clear();
  }, []);

  const searchableAttendees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return attendees.filter((attendee) => {
      const isEligible = attendee.status === "CONFIRMED" && attendee.ticket?.status === "VALID";
      const matches =
        !term ||
        `${attendee.firstName} ${attendee.lastName}`.toLowerCase().includes(term) ||
        attendee.email.toLowerCase().includes(term);
      return isEligible && matches;
    }).slice(0, 8);
  }, [attendees, search]);

  async function manualCheckIn(registrationId: string) {
    if (!eventId || inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(registrationId);
    setError(null);
    setMessage(null);
    try {
      const result = await staffApi<{
        attendee: { firstName: string; lastName: string };
      }>(`/events/${eventId}/check-ins/manual`, {
        method: "POST",
        body: JSON.stringify({ registrationId }),
      });
      setMessage(`${result.attendee.firstName} ${result.attendee.lastName} checked in successfully.`);
      setSearch("");
      await loadEventRecords();
      if (messageTimer.current) clearTimeout(messageTimer.current);
      messageTimer.current = setTimeout(() => setMessage(null), 6000);
    } catch (checkError: unknown) {
      setError(checkError instanceof Error ? checkError.message : "Manual check-in failed.");
    } finally {
      inFlightRef.current = false;
      setSubmitting(null);
    }
  }

  const event = events.find((item) => item.id === eventId);
  const checkedInCount = checkIns.length;
  const confirmedCount = attendees.filter((item) => item.status === "CONFIRMED").length;

  return (
    <main>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-indigo-700">Event operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Check-in</h1>
          <p className="mt-2 text-sm text-slate-600">Scan a ticket or find an attendee to check them in.</p>
        </div>
        {event && <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />{event.title}</span>}
      </div>

      {error && <p className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert"><AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{error}</p>}
      {message && <p className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status"><CheckCircle2 aria-hidden="true" className="size-4" />{message}</p>}
      {!loading && events.length === 0 && !error && (
        <section
          aria-labelledby="no-assigned-events-heading"
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
          role="status"
        >
          <h2 className="font-semibold" id="no-assigned-events-heading">
            No events are assigned to your account
          </h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            Check-in Staff can only access assigned events. Attendee search and
            camera scanning become available after a Super Admin or Event
            Manager assigns you to an active event.
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Ask them to open the event in Dashboard → Events, add you under
            Assigned check-in staff, and save the assignment.
          </p>
        </section>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="min-w-[14rem] flex-1 text-sm font-medium text-slate-700">Assigned event
              <select className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" disabled={loading || events.length === 0} onChange={(input) => setEventId(input.target.value)} value={eventId}>
                {events.length === 0 && <option value="">{loading ? "Loading assigned events…" : "No assigned events"}</option>}
                {events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <div className="flex gap-5 pb-1 text-sm">
              <span><strong className="text-slate-950">{checkedInCount}</strong><span className="ml-1.5 text-slate-500">checked in</span></span>
              <span><strong className="text-slate-950">{confirmedCount}</strong><span className="ml-1.5 text-slate-500">confirmed</span></span>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
            <div aria-label="QR ticket camera preview" className="min-h-72 w-full [&_video]:max-h-[28rem] [&_video]:w-full [&_video]:object-cover" id="eventhub-qr-scanner" />
            {!scanning && (
              <div className="-mt-72 flex min-h-72 flex-col items-center justify-center px-5 text-center text-white">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-indigo-200"><QrCode aria-hidden="true" className="size-7" /></span>
                <p className="mt-4 font-semibold">Camera scanner</p>
                <p className="mt-1 max-w-xs text-sm text-slate-300">Use your device camera to scan an attendee’s QR ticket.</p>
                <button className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-indigo-50 disabled:opacity-50" disabled={!eventId || submitting === "scan"} onClick={() => void startScanner()} type="button"><Camera aria-hidden="true" className="size-4" />Start camera</button>
                {scannerError && <p className="mt-3 max-w-sm text-xs text-amber-200" role="alert">{scannerError}</p>}
              </div>
            )}
            {scanning && (
              <div className="flex justify-center border-t border-white/10 p-3">
                <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/20" onClick={() => void stopScanner()} type="button"><X aria-hidden="true" className="size-4" />Stop scanner</button>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Camera access requires browser permission and HTTPS outside localhost. Ticket validation and duplicate-scan protection happen on the server.</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><UserCheck aria-hidden="true" className="size-5" /></span>
            <div><h2 className="font-semibold">Manual check-in</h2><p className="mt-0.5 text-xs text-slate-500">Search confirmed attendees as a camera fallback.</p></div>
          </div>
          <label className="relative mt-5 block">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" disabled={!eventId} onChange={(input) => setSearch(input.target.value)} placeholder="Name or email" value={search} />
          </label>
          <div className="mt-3 divide-y divide-slate-100">
            {search.trim() && searchableAttendees.length === 0 && <p className="py-5 text-center text-sm text-slate-500">No eligible attendee found.</p>}
            {searchableAttendees.map((attendee) => (
              <div className="flex items-center justify-between gap-3 py-3" key={attendee.id}>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{attendee.firstName} {attendee.lastName}</p><p className="truncate text-xs text-slate-500">{attendee.email}</p></div>
                <button className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60" disabled={Boolean(submitting)} onClick={() => void manualCheckIn(attendee.id)} type="button">{submitting === attendee.id ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <UserCheck aria-hidden="true" className="size-3.5" />}Check in</button>
              </div>
            ))}
          </div>
          {!search && <p className="py-7 text-center text-sm text-slate-400">Start typing to find an attendee.</p>}
        </article>
      </section>

      <section aria-labelledby="checkin-recent-heading" className="mt-8">
        <div className="flex items-end justify-between">
          <div><h2 className="text-lg font-semibold" id="checkin-recent-heading">Recent check-ins</h2><p className="mt-1 text-sm text-slate-500">Most recent attendee arrivals for this event.</p></div>
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Users aria-hidden="true" className="size-4" />{checkIns.length}</span>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {checkIns.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No check-ins recorded yet.</p> : (
            <div className="divide-y divide-slate-100">
              {checkIns.slice(0, 12).map((record) => (
                <article className="flex items-center justify-between gap-4 px-5 py-3.5" key={record.id}>
                  <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><TicketCheck aria-hidden="true" className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{record.ticket.registration.firstName} {record.ticket.registration.lastName}</p><p className="truncate text-xs text-slate-500">{record.ticket.registration.email}</p></div></div>
                  <div className="shrink-0 text-right"><p className="text-sm font-medium text-slate-700">{formatDate(record.checkedInAt)}</p><p className="text-xs text-slate-500">by {record.staff.firstName} {record.staff.lastName}</p></div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
