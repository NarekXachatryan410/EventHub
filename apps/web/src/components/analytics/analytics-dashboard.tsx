"use client";

import { BarChart3, CalendarDays, Download, Star, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { publicApiBaseUrl } from "@/lib/api";
import { staffApi } from "@/lib/staff-api";

type AnalyticsData = {
  overview: {
    totalEvents: number;
    publishedEvents: number;
    totalRegistrations: number;
    confirmedRegistrations: number;
    checkedInAttendees: number;
    attendanceRate: number;
    noShowRate: number;
    attendanceEligibleRegistrations: number;
    feedbackResponses: number;
    averageRatings: {
      overall: number | null;
      content: number | null;
      organization: number | null;
    };
  };
  registrationTrend: { month: string; registrations: number }[];
  eventPerformance: {
    id: string;
    title: string;
    startDate: string;
    status: string;
    registrations: number;
    confirmed: number;
    checkedIn: number;
    attendanceRate: number;
    feedbackResponses: number;
    averageRating: number | null;
  }[];
};

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    staffApi<AnalyticsData>("/analytics/dashboard?months=12")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load analytics.",
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

  const maxRegistrations = useMemo(
    () => Math.max(1, ...(data?.registrationTrend.map((row) => row.registrations) ?? [])),
    [data?.registrationTrend],
  );

  const stats = data
    ? [
        {
          label: "Total events",
          value: data.overview.totalEvents.toLocaleString(),
          detail: `${data.overview.publishedEvents} currently published`,
          icon: CalendarDays,
          tone: "indigo",
        },
        {
          label: "Registrations",
          value: data.overview.totalRegistrations.toLocaleString(),
          detail: `${data.overview.confirmedRegistrations.toLocaleString()} confirmed`,
          icon: Users,
          tone: "violet",
        },
        {
          label: "Attendance rate",
          value: `${data.overview.attendanceRate}%`,
          detail: `${data.overview.checkedInAttendees.toLocaleString()} checked in · ${data.overview.attendanceEligibleRegistrations.toLocaleString()} eligible`,
          icon: BarChart3,
          tone: "emerald",
        },
        {
          label: "No-show rate",
          value: `${data.overview.noShowRate}%`,
          detail: "For past, non-cancelled events",
          icon: Star,
          tone: "amber",
        },
      ]
    : [];

  return (
    <main>
      <header>
        <p className="text-sm font-medium text-indigo-700">Performance overview</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Analytics & reports
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Event reach, attendance, registration trends, and attendee feedback.
        </p>
      </header>

      {error && (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="h-32 animate-pulse rounded-2xl bg-slate-200" key={index} />
          ))}
        </div>
      ) : data ? (
        <>
          <section aria-label="Key metrics" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              const tones: Record<string, string> = {
                indigo: "bg-indigo-50 text-indigo-700",
                violet: "bg-violet-50 text-violet-700",
                emerald: "bg-emerald-50 text-emerald-700",
                amber: "bg-amber-50 text-amber-700",
              };
              return (
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={stat.label}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{stat.value}</p>
                    </div>
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tones[stat.tone]}`}>
                      <Icon aria-hidden="true" className="size-[18px]" />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{stat.detail}</p>
                </article>
              );
            })}
          </section>

          <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <section aria-labelledby="registration-trends" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="font-semibold text-slate-950" id="registration-trends">Registration trends</h2>
                <p className="mt-1 text-sm text-slate-500">Monthly registrations over the past year</p>
              </div>
              <div className="mt-6 grid h-48 grid-cols-12 items-end gap-2 sm:gap-3">
                {data.registrationTrend.map((row) => {
                  const height = row.registrations === 0
                    ? 3
                    : Math.max(8, (row.registrations / maxRegistrations) * 100);
                  return (
                    <div className="flex h-full flex-col items-center justify-end gap-2" key={row.month}>
                      <span className="text-[10px] font-medium text-slate-500">
                        {row.registrations || ""}
                      </span>
                      <div
                        aria-label={`${row.registrations} registrations in ${formatMonth(row.month)}`}
                        className="w-full min-w-2 rounded-t-md bg-indigo-500"
                        role="img"
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-[9px] text-slate-400 sm:text-[10px]">
                        {formatMonth(row.month)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="feedback-summary" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-950" id="feedback-summary">Attendee feedback</h2>
                  <p className="mt-1 text-sm text-slate-500">Collected after completed events</p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Star aria-hidden="true" className="size-5" />
                </span>
              </div>
              <p className="mt-6 text-4xl font-semibold tracking-tight text-slate-950">
                {formatRating(data.overview.averageRatings.overall)}
                <span className="ml-2 text-base font-medium text-slate-500">/ 5</span>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Overall average from {data.overview.feedbackResponses.toLocaleString()} responses
              </p>
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <RatingRow label="Content" value={data.overview.averageRatings.content} />
                <RatingRow label="Organization" value={data.overview.averageRatings.organization} />
              </div>
            </section>
          </div>

          <section aria-labelledby="event-performance" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-semibold text-slate-950" id="event-performance">Event performance</h2>
                <p className="mt-1 text-sm text-slate-500">Most recently scheduled events and feedback exports</p>
              </div>
              <span className="text-xs text-slate-500">Showing up to 20 events</span>
            </div>
            {data.eventPerformance.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">No event data is available yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Event</th>
                      <th className="px-3 py-3 font-semibold">Registrations</th>
                      <th className="px-3 py-3 font-semibold">Attendance</th>
                      <th className="px-3 py-3 font-semibold">Rating</th>
                      <th className="px-3 py-3 font-semibold">Responses</th>
                      <th className="px-5 py-3 text-right font-semibold">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.eventPerformance.map((event) => (
                      <tr key={event.id}>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-900">{event.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {new Date(event.startDate).toLocaleDateString()} · {event.status.replaceAll("_", " ")}
                          </p>
                        </td>
                        <td className="px-3 py-3.5 text-slate-700">{event.registrations.toLocaleString()}</td>
                        <td className="px-3 py-3.5 text-slate-700">
                          {event.attendanceRate}% <span className="text-xs text-slate-400">({event.checkedIn}/{event.confirmed})</span>
                        </td>
                        <td className="px-3 py-3.5 text-slate-700">{formatRating(event.averageRating)}</td>
                        <td className="px-3 py-3.5 text-slate-700">{event.feedbackResponses}</td>
                        <td className="px-5 py-3.5 text-right">
                          <a
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            href={`${publicApiBaseUrl}/api/events/${event.id}/feedback/export`}
                          >
                            <Download aria-hidden="true" className="size-3.5" />
                            CSV
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function RatingRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{formatRating(value)} / 5</span>
    </div>
  );
}

function formatRating(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short" }).format(
    new Date(`${value}-01T00:00:00.000Z`),
  );
}
