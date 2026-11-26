import { Suspense } from "react";
import type { Metadata } from "next";
import { CancellationForm } from "@/components/events/cancellation-form";

export const metadata: Metadata = {
  title: "Cancel registration | EventHub",
  robots: { index: false, follow: false },
};

export default async function CancelRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ registrationId?: string; token?: string }>;
}) {
  return (
    <Suspense fallback={<main className="eh-public-page mx-auto min-h-screen max-w-2xl px-5 py-12">Loading cancellation link…</main>}>
      <CancelRegistrationContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CancelRegistrationContent({
  searchParams,
}: {
  searchParams: Promise<{ registrationId?: string; token?: string }>;
}) {
  const { registrationId, token } = await searchParams;
  return (
    <main className="eh-public-page mx-auto min-h-screen w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">EventHub · Registration support</p>
      <h1 className="mt-3 text-3xl sm:text-4xl">Cancel registration</h1>
      <p className="mt-2 mb-7 text-sm text-slate-600">This action releases your reserved place for the event.</p>
      <CancellationForm registrationId={registrationId ?? ""} token={token ?? ""} />
    </main>
  );
}
