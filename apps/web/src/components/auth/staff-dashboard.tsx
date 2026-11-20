"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStaffUser } from "@/components/auth/staff-shell";
import {
  formatDate,
  roleLabel,
  staffApi,
  type StaffEvent,
} from "@/lib/staff-api";

export function StaffDashboard() {
  const user = useStaffUser();
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [checkedInCount, setCheckedInCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    staffApi<StaffEvent[]>("/events/manage")
      .then(async (managedEvents) => {
        const checkInCounts = await Promise.all(
          managedEvents.map(async (event) => {
            const rows = await staffApi<unknown[]>(
              `/events/${event.id}/check-ins`,
            );
            return rows.length;
          }),
        );
        if (active) {
          setEvents(managedEvents);
          setCheckedInCount(
            checkInCounts.reduce((total, count) => total + count, 0),
          );
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your events.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const upcoming = useMemo(
    () =>
      events.filter(
        (event) =>
          new Date(event.startDate) > new Date() &&
          event.status !== "CANCELLED",
      ).length,
    [events],
  );
  const registrationTotal = useMemo(
    () => events.reduce((total, event) => total + (event._count?.registrations ?? 0), 0),
    [events],
  );
  const published = useMemo(
    () => events.filter((event) => event.status === "PUBLISHED").length,
    [events],
  );

  const stats = [
    { label: "Total events", value: loading ? "—" : events.length, icon: CalendarDays, tone: "indigo" },
    { label: "Upcoming", value: loading ? "—" : upcoming, icon: Clock3, tone: "blue" },
    { label: "Registrations", value: loading ? "—" : registrationTotal, icon: Users, tone: "violet" },
    { label: "Checked in", value: loading ? "—" : checkedInCount ?? "—", icon: CheckCircle2, tone: "emerald" },
  ];

  return (
    <main>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-indigo-700">{user ? roleLabel(user.role) : "Staff workspace"}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Good {greeting()}, {user?.firstName ?? "there"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Here’s what’s happening across your Academy events.
          </p>
        </div>
        {user && user.role !== "CHECK_IN_STAFF" && (
          <Link
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            href="/dashboard/events/new"
          >
            <Plus aria-hidden="true" className="size-4" />
            Create event
          </Link>
        )}
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <section aria-label="Event overview" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const tones: Record<string, string> = {
            indigo: "bg-indigo-50 text-indigo-700",
            blue: "bg-sky-50 text-sky-700",
            violet: "bg-violet-50 text-violet-700",
            emerald: "bg-emerald-50 text-emerald-700",
          };
          return (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={stat.label}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                <span className={`flex size-10 items-center justify-center rounded-xl ${tones[stat.tone]}`}>
                  <Icon aria-hidden="true" className="size-[18px]" />
                </span>
              </div>
              <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">{stat.value}</p>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="events-heading" className="mt-9">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950" id="events-heading">Your events</h2>
            <p className="mt-1 text-sm text-slate-500">
              {loading ? "Loading events…" : `${published} published · ${upcoming} upcoming`}
            </p>
          </div>
          <Link className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 hover:text-indigo-900" href={user?.role === "CHECK_IN_STAFF" ? "/dashboard/check-in" : "/dashboard/events"}>
            {user?.role === "CHECK_IN_STAFF" ? "Open check-in" : "All events"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-3 p-5" role="status">
              <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : events.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <CalendarDays aria-hidden="true" className="mx-auto size-9 text-slate-300" />
              <h3 className="mt-3 font-semibold text-slate-900">No events yet</h3>
              <p className="mt-1 text-sm text-slate-500">Events assigned to you will show up here.</p>
              {user && user.role !== "CHECK_IN_STAFF" && (
                <Link className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white" href="/dashboard/events/new">
                  <Plus aria-hidden="true" className="size-4" /> Create your first event
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {events.slice(0, 6).map((event) => (
                <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" key={event.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-slate-900">{event.title}</h3>
                      <StatusBadge status={event.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatDate(event.startDate)} <span className="px-1">·</span> {event.location}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="text-sm text-slate-500">
                      <strong className="text-slate-900">{event._count?.registrations ?? 0}</strong> registrations
                    </span>
                    <Link
                      aria-label={user?.role === "CHECK_IN_STAFF" ? `Check in to ${event.title}` : `Manage ${event.title}`}
                      className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      href={user?.role === "CHECK_IN_STAFF" ? `/dashboard/check-in?eventId=${event.id}` : `/dashboard/events/${event.id}`}
                    >
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const style =
    status === "PUBLISHED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "CANCELLED"
        ? "bg-red-50 text-red-700"
        : status === "COMPLETED"
          ? "bg-sky-50 text-sky-700"
          : status === "REGISTRATION_CLOSED"
            ? "bg-amber-50 text-amber-700"
            : status === "ARCHIVED"
              ? "bg-slate-200 text-slate-700"
            : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style}`}>
      {status === "CANCELLED" && <CircleAlert aria-hidden="true" className="size-3" />}
      {status.replaceAll("_", " ")}
    </span>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
