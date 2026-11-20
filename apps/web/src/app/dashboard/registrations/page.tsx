import type { Metadata } from "next";
import { RegistrationsPage } from "@/components/registrations/registrations-page";

export const metadata: Metadata = {
  title: "Registrations | EventHub",
  robots: { index: false },
};

export default function Page() {
  return <RegistrationsPage />;
}
