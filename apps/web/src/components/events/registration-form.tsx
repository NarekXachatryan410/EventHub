"use client";

import { useState } from "react";

type RegistrationQuestion = {
  key: string;
  label: string;
  type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  required: boolean;
  options?: string[];
};

type RegistrationResult = {
  status: "CONFIRMED" | "WAITLISTED";
  ticket?: {
    token: string;
    qrCodeDataUrl: string;
  };
};

type RegistrationFormProps = {
  eventId: string;
  questions: RegistrationQuestion[];
  waitlistAvailable: boolean;
};

export function RegistrationForm({
  eventId,
  questions,
  waitlistAvailable,
}: RegistrationFormProps) {
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitRegistration(formData: FormData) {
    setError(null);
    setIsSubmitting(true);

    const additionalAnswers = Object.fromEntries(
      questions.map((question) => {
        const values = formData.getAll(`question:${question.key}`);
        const answer =
          question.type === "MULTIPLE_CHOICE"
            ? values.filter((value): value is string => typeof value === "string")
            : values[0] ?? null;
        return [question.key, answer];
      }),
    );

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/events/${eventId}/register`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            firstName: formData.get("firstName"),
            lastName: formData.get("lastName"),
            email: formData.get("email"),
            phone: formData.get("phone") || undefined,
            organization: formData.get("organization") || undefined,
            interestedInPrograms: formData.get("interestedInPrograms") === "on",
            marketingConsent: formData.get("marketingConsent") === "on",
            joinWaitlist: formData.get("joinWaitlist") === "on",
            additionalAnswers,
          }),
        },
      );
      const payload = (await response.json()) as
        | RegistrationResult
        | { message?: string | string[] };

      if (!response.ok) {
        const message = "message" in payload ? payload.message : undefined;
        throw new Error(
          Array.isArray(message)
            ? message.join(". ")
            : message ?? "Registration could not be completed.",
        );
      }

      setResult(payload as RegistrationResult);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Registration could not be completed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-xl font-semibold">
          {result.status === "WAITLISTED"
            ? "You are on the waiting list"
            : "Your registration is confirmed"}
        </h2>
        {result.ticket ? (
          <div className="mt-4 flex flex-wrap items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Your event ticket QR code"
              className="h-36 w-36 rounded-lg border border-stone-200 p-2"
              src={result.ticket.qrCodeDataUrl}
            />
            <p className="max-w-sm text-sm leading-6 text-stone-600">
              Keep this ticket ready for check-in. A confirmation email will
              also be sent to the address you provided.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">
            We will email you if a place becomes available.
          </p>
        )}
      </section>
    );
  }

  return (
    <form
      action={submitRegistration}
      className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-xl font-semibold">Register for this event</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          First name
          <input
            autoComplete="given-name"
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
            maxLength={80}
            name="firstName"
            required
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Last name
          <input
            autoComplete="family-name"
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
            maxLength={80}
            name="lastName"
            required
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        Email
        <input
          autoComplete="email"
          className="w-full rounded-lg border border-stone-300 px-3 py-2"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Phone number <span className="font-normal text-stone-500">Optional</span>
          <input
            autoComplete="tel"
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
            name="phone"
            type="tel"
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Organization <span className="font-normal text-stone-500">Optional</span>
          <input
            autoComplete="organization"
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
            maxLength={160}
            name="organization"
          />
        </label>
      </div>
      {questions.map((question) => (
        <label className="block space-y-1 text-sm font-medium" key={question.key}>
          {question.label}
          {question.type === "LONG_TEXT" ? (
            <textarea
              className="min-h-24 w-full rounded-lg border border-stone-300 px-3 py-2"
              name={`question:${question.key}`}
              required={question.required}
            />
          ) : question.type === "SINGLE_CHOICE" ||
            question.type === "MULTIPLE_CHOICE" ? (
            <select
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
              multiple={question.type === "MULTIPLE_CHOICE"}
              name={`question:${question.key}`}
              required={question.required}
            >
              {question.type === "SINGLE_CHOICE" && (
                <option value="">Select an option</option>
              )}
              {question.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
              name={`question:${question.key}`}
              required={question.required}
            />
          )}
        </label>
      ))}
      <label className="flex items-start gap-2 text-sm text-stone-700">
        <input className="mt-1" name="interestedInPrograms" type="checkbox" />
        I am interested in Academy programs.
      </label>
      <label className="flex items-start gap-2 text-sm text-stone-700">
        <input className="mt-1" name="marketingConsent" type="checkbox" />
        I agree to receive Academy marketing emails. This is optional.
      </label>
      {waitlistAvailable && (
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input className="mt-1" name="joinWaitlist" type="checkbox" />
          If the event is full, add me to the waiting list.
        </label>
      )}
      {error && (
        <p aria-live="assertive" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Submitting…" : "Complete registration"}
      </button>
      <p className="text-xs leading-5 text-stone-500">
        Registration information is used to manage this event. Marketing consent
        is optional.
      </p>
    </form>
  );
}
