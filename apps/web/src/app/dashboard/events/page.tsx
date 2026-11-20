import type { Metadata } from "next";
import { EventList } from "@/components/events/event-list";

export const metadata: Metadata = {
  title: "Events | EventHub",
  robots: { index: false },
};

export default function EventsPage() {
  return <EventList />;
}
