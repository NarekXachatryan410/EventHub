import type { Metadata } from "next";
import { StaffDashboard } from "@/components/auth/staff-dashboard";

export const metadata: Metadata = {
  title: "Staff workspace | EventHub",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <StaffDashboard />;
}
