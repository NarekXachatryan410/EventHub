import { publicApiBaseUrl } from "@/lib/api";

export type StaffRole = "SUPER_ADMIN" | "EVENT_MANAGER" | "CHECK_IN_STAFF";

export type StaffUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
};

export type StaffEvent = {
  id: string;
  title: string;
  slug: string;
  description: string;
  coverImage: string | null;
  type: string;
  status: string;
  location: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  maxAttendees: number | null;
  registrationEnabled: boolean;
  reminderOffsetsHours?: number[];
  contactEmail: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  organizer?: { id: string; firstName: string; lastName: string; email: string };
  staffAssignments?: {
    staff: { id: string; firstName: string; lastName: string; email: string };
  }[];
  _count?: { registrations: number; feedback?: number };
};

export type StaffRegistration = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  status: string;
  registeredAt: string;
  ticket: {
    status: string;
    checkIn: { checkedInAt: string; checkedInBy: string } | null;
  } | null;
};

export type StaffEmailLog = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  scheduledAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  registration: {
    email: string;
    firstName: string;
    lastName: string;
    event: { id: string; title: string };
  };
};

export async function staffApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${publicApiBaseUrl}/api${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? payload.message
        : undefined;
    throw new Error(
      Array.isArray(message)
        ? message.join(". ")
        : typeof message === "string"
          ? message
          : `Request failed (${response.status})`,
    );
  }
  return payload as T;
}

export function roleLabel(role: StaffRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "EVENT_MANAGER":
      return "Event Manager";
    case "CHECK_IN_STAFF":
      return "Check-in Staff";
  }
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
