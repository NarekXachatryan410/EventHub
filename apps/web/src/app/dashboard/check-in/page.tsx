import type { Metadata } from "next";
import { CheckInWorkspace } from "@/components/check-in/check-in-workspace";

export const metadata: Metadata = {
  title: "Check-in | EventHub",
  robots: { index: false },
};

export default function CheckInPage() {
  return <CheckInWorkspace />;
}
