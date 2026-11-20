"use client";

import { useState } from "react";
import { publicApiBaseUrl } from "@/lib/api";

export function CancellationForm({
  registrationId,
  token,
}: {
  registrationId: string;
  token: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [saving, setSaving] = useState(false);

  async function cancelRegistration() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${publicApiBaseUrl}/api/registrations/${encodeURIComponent(registrationId)}/cancel`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cancellationToken: token }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;
      if (!response.ok) {
        const message = payload?.message;
        throw new Error(
          Array.isArray(message)
            ? message.join(". ")
            : message ?? `Cancellation failed (${response.status}).`,
        );
      }
      setCancelled(true);
    } catch (cancelError: unknown) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Cancellation could not be completed.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!registrationId || !token) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">This cancellation link is incomplete.</p>;
  }
  if (cancelled) {
    return <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800" role="status">Your registration has been cancelled. A confirmation email will be sent.</p>;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">Cancel your registration using the secure link sent to your email.</p>
      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
      <button className="mt-5 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} onClick={() => void cancelRegistration()} type="button">
        {saving ? "Cancelling…" : "Cancel registration"}
      </button>
    </div>
  );
}
