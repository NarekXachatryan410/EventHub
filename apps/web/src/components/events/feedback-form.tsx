"use client";

import { useState, type FormEvent } from "react";
import { publicApiBaseUrl } from "@/lib/api";

export function FeedbackForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${publicApiBaseUrl}/api/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          feedbackToken: token,
          overallRating: Number(formData.get("overallRating")),
          contentRating: Number(formData.get("contentRating")),
          organizationRating: Number(formData.get("organizationRating")),
          comment: formData.get("comment") || undefined,
          interestedInPrograms: formData.get("interestedInPrograms") === "on",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;
      if (!response.ok) {
        const message = payload?.message;
        throw new Error(
          Array.isArray(message)
            ? message.join(". ")
            : message ?? `Feedback could not be submitted (${response.status}).`,
        );
      }
      setSubmitted(true);
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Feedback could not be submitted.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">This feedback link is incomplete.</p>;
  }
  if (submitted) {
    return <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800" role="status">Thank you. Your feedback has been recorded.</p>;
  }

  const ratingOptions = [1, 2, 3, 4, 5].map((rating) => (
    <option key={rating} value={rating}>{rating}</option>
  ));

  return (
    <form className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={submit}>
      <h2 className="text-xl font-semibold">Share your feedback</h2>
      {(["overallRating", "contentRating", "organizationRating"] as const).map((field) => (
        <label className="block text-sm font-medium text-slate-700" key={field}>
          {field === "overallRating" ? "Overall event rating" : field === "contentRating" ? "Content quality" : "Organization"}
          <select className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3" name={field} required>
            <option value="">Select a rating</option>
            {ratingOptions}
          </select>
        </label>
      ))}
      <label className="block text-sm font-medium text-slate-700">
        Additional comments <span className="font-normal text-slate-500">(optional)</span>
        <textarea className="mt-1.5 min-h-28 w-full rounded-lg border border-slate-300 p-3" maxLength={5000} name="comment" />
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input className="mt-1" name="interestedInPrograms" type="checkbox" />
        I am interested in Academy programs.
      </label>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <button className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} type="submit">
        {saving ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
