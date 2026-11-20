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
    <Suspense fallback={<main className="mx-auto min-h-screen max-w-xl px-5 py-12">Loading cancellation link…</main>}>
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
    <main className="mx-auto min-h-screen w-full max-w-xl px-5 py-12">
      <p className="text-sm font-medium text-indigo-700">EventHub</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Cancel registration</h1>
      <p className="mt-2 mb-7 text-sm text-slate-600">This action releases your reserved place for the event.</p>
      <CancellationForm registrationId={registrationId ?? ""} token={token ?? ""} />
    </main>
  );
}
