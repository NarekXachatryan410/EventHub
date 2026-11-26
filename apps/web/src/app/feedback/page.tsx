import { Suspense } from "react";
import type { Metadata } from "next";
import { FeedbackForm } from "@/components/events/feedback-form";

export const metadata: Metadata = {
  title: "Event feedback | EventHub",
  robots: { index: false, follow: false },
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Suspense fallback={<main className="eh-public-page mx-auto min-h-screen max-w-2xl px-5 py-12">Loading feedback form…</main>}>
      <FeedbackContent searchParams={searchParams} />
    </Suspense>
  );
}

async function FeedbackContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="eh-public-page mx-auto min-h-screen w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">EventHub · Attendee feedback</p>
      <h1 className="mt-3 text-3xl sm:text-4xl">Thank you for attending</h1>
      <p className="mt-2 mb-7 text-sm text-slate-600">Your feedback helps us improve future Academy events.</p>
      <FeedbackForm token={token ?? ""} />
    </main>
  );
}
