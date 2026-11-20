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
    <Suspense fallback={<main className="mx-auto min-h-screen max-w-xl px-5 py-12">Loading ticket…</main>}>
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
    <main className="mx-auto min-h-screen w-full max-w-xl px-5 py-12">
      <p className="text-sm font-medium text-indigo-700">EventHub</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your event ticket</h1>
      <p className="mt-2 mb-7 text-sm text-slate-600">Show this QR code to event staff at check-in.</p>
      <TicketPage token={token} />
    </main>
  );
}
