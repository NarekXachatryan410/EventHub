import type { Metadata } from "next";
import { StaffManagement } from "@/components/staff/staff-management";

export const metadata: Metadata = {
  title: "Staff Management | EventHub",
  robots: { index: false },
};

export default function StaffManagementPage() {
  return <StaffManagement />;
}
