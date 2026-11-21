import type { Metadata } from "next";
import { CrmCustomerProfile } from "@/components/crm/crm-customer-profile";
export const metadata: Metadata = { title: "Customer profile | EventHub", robots: { index: false, follow: false } };
export default async function CrmCustomerRoute({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <CrmCustomerProfile customerId={id} key={id} />; }
