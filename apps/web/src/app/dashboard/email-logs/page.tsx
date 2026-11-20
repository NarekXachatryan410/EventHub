import type { Metadata } from "next";
import { EmailLogsPage } from "@/components/email/email-logs-page";

export const metadata: Metadata = {
  title: "Email Logs | EventHub",
  robots: { index: false },
};

export default function Page() {
  return <EmailLogsPage />;
}
