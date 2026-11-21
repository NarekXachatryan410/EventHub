import type { Metadata } from "next";
import { CrmDashboard } from "@/components/crm/crm-dashboard";
export const metadata: Metadata = { title: "CRM | EventHub", robots: { index: false, follow: false } };
export default function CrmPage() { return <CrmDashboard />; }
