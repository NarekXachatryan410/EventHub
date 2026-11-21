import type { Metadata } from "next";
import { CrmRemindersPage } from "@/components/crm/crm-reminders-page";
export const metadata: Metadata = { title: "CRM reminders | EventHub", robots: { index: false, follow: false } };
export default function CrmRemindersRoute() { return <CrmRemindersPage />; }
