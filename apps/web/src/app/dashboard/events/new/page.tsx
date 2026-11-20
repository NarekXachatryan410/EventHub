import type { Metadata } from "next";
import { EventEditor } from "@/components/events/event-editor";

export const metadata: Metadata = {
  title: "Create Event | EventHub",
  robots: { index: false },
};

export default function CreateEventPage() {
  return <EventEditor />;
}
