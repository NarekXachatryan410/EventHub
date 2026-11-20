"use client";

import { useEffect, useState } from "react";
import { publicApiBaseUrl } from "@/lib/api";
import { formatDate } from "@/lib/staff-api";

type TicketDetails = {
  valid: boolean;
  status: string;
  checkedInAt: string | null;
  qrCodeDataUrl: string;
  attendee: { firstName: string; lastName: string };
  event: { title: string; startDate: string };
};

export function TicketPage({ token }: { token: string }) {
  const [ticket, setTicket] = useState<TicketDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${publicApiBaseUrl}/api/tickets/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | TicketDetails
          | { message?: string | string[] }
          | null;
        if (!response.ok) {
          const message = payload && "message" in payload ? payload.message : undefined;
          throw new Error(
            Array.isArray(message)
              ? message.join(". ")
              : message ?? `Ticket could not be loaded (${response.status}).`,
          );
        }
        if (!payload || !("qrCodeDataUrl" in payload)) {
          throw new Error("The server returned an invalid ticket.");
        }
        if (active) setTicket(payload);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Ticket could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">{error}</p>;
  }
  if (!ticket) {
    return <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600" role="status">Loading your ticket…</p>;
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ticket.valid ? "bg-emerald-50 text-emerald-700" : ticket.status === "CHECKED_IN" ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-700"}`}>
        {ticket.valid ? "Valid ticket" : ticket.status === "CHECKED_IN" ? "Already checked in" : "Ticket is not valid"}
      </p>
      <h2 className="mt-4 text-xl font-semibold">{ticket.event.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{formatDate(ticket.event.startDate)}</p>
      <p className="mt-3 text-sm text-slate-700">{ticket.attendee.firstName} {ticket.attendee.lastName}</p>
      {ticket.valid && (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="QR code for event check-in" className="mx-auto mt-5 size-64 rounded-xl border border-slate-200 p-3" src={ticket.qrCodeDataUrl} />
      )}
      {ticket.checkedInAt && <p className="mt-4 text-sm text-slate-600">Checked in {formatDate(ticket.checkedInAt)}</p>}
      <p className="mt-4 text-xs text-slate-500">Keep this ticket private. The QR code is a secure check-in credential.</p>
    </article>
  );
}
