import { staffApi } from "@/lib/staff-api";

export type CrmCustomerStatus = "ACTIVE" | "ARCHIVED";
export type CrmReminderStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type CrmCustomer = {
  id: string;
  organizerId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthday: string | null;
  profileImageUrl: string | null;
  status: CrmCustomerStatus;
  marketingConsent: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { registrations: number; notes: number; activities?: number };
};
export type CrmCustomerPage = { items: CrmCustomer[]; nextCursor: string | null };
export type CrmTag = { id: string; organizerId: string; name: string; color: string; _count?: { customers: number } };
export type CrmNote = { id: string; content: string; createdAt: string; updatedAt: string; author: { id: string; firstName: string; lastName: string } | null };
export type CrmRegistration = {
  id: string;
  eventId: string;
  registeredAt: string;
  status: string;
  event: { title: string; startDate: string; status: string };
  ticket: { status: string; checkIn: { checkedInAt: string } | null } | null;
};
export type CrmCustomerProfile = CrmCustomer & {
  tags: { assignedAt: string; tag: CrmTag }[];
  registrations: CrmRegistration[];
};
export type CrmActivity = {
  id: string;
  type: string;
  summary: string;
  occurredAt: string;
  actor?: { id: string; firstName: string; lastName: string } | null;
  event?: { id: string; title: string } | null;
  metadata?: Record<string, unknown> | null;
};
export type CrmReminder = {
  id: string;
  customerId: string;
  title: string;
  description: string | null;
  dueAt: string;
  status: CrmReminderStatus;
  completedAt: string | null;
  customer: Pick<CrmCustomer, "id" | "firstName" | "lastName" | "email" | "organizerId">;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  createdBy: { id: string; firstName: string; lastName: string };
};
export type CrmSegmentCriteria = {
  status?: CrmCustomerStatus;
  registeredAfter?: string;
  registeredBefore?: string;
  minTickets?: number;
  maxTickets?: number;
  attended?: boolean;
  tagIds?: string[];
};
export type CrmSegment = {
  id: string;
  organizerId: string;
  name: string;
  description: string | null;
  criteria: CrmSegmentCriteria;
  total: number;
  items: Pick<CrmCustomer, "id" | "email" | "firstName" | "lastName" | "status">[];
};
export type CrmPage<T> = { items: T[]; nextCursor: string | null };
export type StaffOrganizer = { id: string; firstName: string; lastName: string; email: string; role: string; isActive: boolean };

export const crmApi = {
  listCustomers: (params: Record<string, string | number | undefined>) => staffApi<CrmCustomerPage>(`/crm/customers?${query(params)}`),
  getCustomer: (id: string) => staffApi<CrmCustomerProfile>(`/crm/customers/${id}`),
  createCustomer: (input: { email: string; firstName: string; lastName: string; phone?: string; birthday?: string; organizerId?: string }) => staffApi<CrmCustomer>("/crm/customers", { method: "POST", body: JSON.stringify(input) }),
  updateCustomer: (id: string, input: Partial<Pick<CrmCustomer, "email" | "firstName" | "lastName" | "phone" | "birthday" | "status">>) => staffApi<CrmCustomer>(`/crm/customers/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  archiveCustomer: (id: string) => staffApi<{ success: boolean }>(`/crm/customers/${id}`, { method: "DELETE" }),
  listTags: (organizerId?: string) => staffApi<CrmTag[]>(`/crm/tags?${query({ organizerId })}`),
  createTag: (name: string, organizerId?: string) => staffApi<CrmTag>("/crm/tags", { method: "POST", body: JSON.stringify({ name, organizerId }) }),
  assignTag: (customerId: string, tagId: string) => staffApi<{ success: boolean }>(`/crm/customers/${customerId}/tags`, { method: "POST", body: JSON.stringify({ tagId }) }),
  removeTag: (customerId: string, tagId: string) => staffApi<{ success: boolean }>(`/crm/customers/${customerId}/tags/${tagId}`, { method: "DELETE" }),
  listNotes: (customerId: string) => staffApi<CrmNote[]>(`/crm/customers/${customerId}/notes`),
  createNote: (customerId: string, content: string) => staffApi<CrmNote>(`/crm/customers/${customerId}/notes`, { method: "POST", body: JSON.stringify({ content }) }),
  updateNote: (customerId: string, noteId: string, content: string) => staffApi<CrmNote>(`/crm/customers/${customerId}/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ content }) }),
  deleteNote: (customerId: string, noteId: string) => staffApi<{ success: boolean }>(`/crm/customers/${customerId}/notes/${noteId}`, { method: "DELETE" }),
  listActivity: (customerId: string, limit = 30, cursor?: string) => staffApi<CrmPage<CrmActivity>>(`/crm/customers/${customerId}/activity?${query({ limit, cursor })}`),
  listReminders: (params: Record<string, string | number | boolean | undefined>) => staffApi<CrmPage<CrmReminder>>(`/crm/reminders?${query(params)}`),
  createReminder: (customerId: string, input: { title: string; description?: string; dueAt: string; assignedToId?: string }) => staffApi<CrmReminder>(`/crm/customers/${customerId}/reminders`, { method: "POST", body: JSON.stringify(input) }),
  updateReminder: (customerId: string, reminderId: string, input: { title?: string; description?: string | null; dueAt?: string; assignedToId?: string | null }) => staffApi<CrmReminder>(`/crm/customers/${customerId}/reminders/${reminderId}`, { method: "PATCH", body: JSON.stringify(input) }),
  completeReminder: (customerId: string, reminderId: string) => staffApi<CrmReminder>(`/crm/customers/${customerId}/reminders/${reminderId}/complete`, { method: "POST" }),
  deleteReminder: (customerId: string, reminderId: string) => staffApi<{ success: boolean }>(`/crm/customers/${customerId}/reminders/${reminderId}`, { method: "DELETE" }),
  listSegments: (organizerId?: string) => staffApi<CrmSegment[]>(`/crm/segments?${query({ organizerId })}`),
  previewSegment: (criteria: CrmSegmentCriteria, organizerId?: string) => staffApi<{ total: number; items: CrmCustomer[] }>("/crm/segments/preview", { method: "POST", body: JSON.stringify({ criteria, organizerId }) }),
  saveSegment: (name: string, criteria: CrmSegmentCriteria, organizerId?: string) => staffApi<CrmSegment>("/crm/segments", { method: "POST", body: JSON.stringify({ name, criteria, organizerId }) }),
  deleteSegment: (id: string) => staffApi<{ success: boolean }>(`/crm/segments/${id}`, { method: "DELETE" }),
  listOrganizers: () => staffApi<StaffOrganizer[]>("/users"),
};

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}
