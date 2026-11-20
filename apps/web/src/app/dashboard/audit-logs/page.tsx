import type { Metadata } from "next";
import { AuditLogsPage } from "@/components/audit/audit-logs-page";

export const metadata: Metadata = {
  title: "Audit Logs | EventHub",
  robots: { index: false },
};

export default function AuditLogsRoute() {
  return <AuditLogsPage />;
}
