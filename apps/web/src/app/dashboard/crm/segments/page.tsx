import type { Metadata } from "next";
import { CrmSegmentsPage } from "@/components/crm/crm-segments-page";
export const metadata: Metadata = { title: "CRM segments | EventHub", robots: { index: false, follow: false } };
export default function CrmSegmentsRoute() { return <CrmSegmentsPage />; }
