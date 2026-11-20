import type { Metadata } from "next";
import { EventEditor } from "@/components/events/event-editor";

export const metadata: Metadata = {
  title: "Manage Event | EventHub",
  robots: { index: false },
};

export default async function ManageEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventEditor eventId={id} />;
}
