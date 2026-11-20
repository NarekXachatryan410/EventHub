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
    <Suspense fallback={<main className="mx-auto min-h-screen max-w-xl px-5 py-12">Loading feedback form…</main>}>
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
    <main className="mx-auto min-h-screen w-full max-w-xl px-5 py-12">
      <p className="text-sm font-medium text-indigo-700">EventHub</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Thank you for attending</h1>
      <p className="mt-2 mb-7 text-sm text-slate-600">Your feedback helps us improve future Academy events.</p>
      <FeedbackForm token={token ?? ""} />
    </main>
  );
}
