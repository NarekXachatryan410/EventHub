import { Suspense } from "react";
import type { Metadata } from "next";
import { TicketPage } from "@/components/events/ticket-page";

export const metadata: Metadata = {
  title: "Your event ticket | EventHub",
  robots: { index: false, follow: false },
};

export default function TicketRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={<main className="eh-public-page mx-auto min-h-screen max-w-2xl px-5 py-12">Loading ticket…</main>}>
      <TicketContent params={params} />
    </Suspense>
  );
}

async function TicketContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="eh-public-page mx-auto min-h-screen w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">EventHub · Digital ticket</p>
      <h1 className="mt-3 text-3xl sm:text-4xl">Your event ticket</h1>
      <p className="mt-2 mb-7 text-sm text-slate-600">Show this QR code to event staff at check-in.</p>
      <TicketPage token={token} />
    </main>
  );
}
