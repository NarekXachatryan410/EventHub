import type { Metadata } from "next";
import { CrmCustomersPage } from "@/components/crm/crm-customers-page";
export const metadata: Metadata = { title: "CRM customers | EventHub", robots: { index: false, follow: false } };
export default function CrmCustomersRoute() { return <CrmCustomersPage />; }
