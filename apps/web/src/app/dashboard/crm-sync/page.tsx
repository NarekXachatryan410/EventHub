import type { Metadata } from "next";
import { CrmSyncPage } from "@/components/crm/crm-sync-page";

export const metadata: Metadata = {
  title: "CRM Sync | EventHub",
  robots: { index: false },
};

export default function CrmSyncRoute() {
  return <CrmSyncPage />;
}
