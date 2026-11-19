"use client";

import {
  ArrowUpRight,
  CalendarDays,
  CircleHelp,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { publicApiBaseUrl } from "@/lib/api";

type StaffUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  EVENT_MANAGER: "Event Manager",
  CHECK_IN_STAFF: "Check-in Staff",
};

export function StaffDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${publicApiBaseUrl}/api/auth/me`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!response.ok) {
          throw new Error("We couldn't load your staff account.");
        }
        return (await response.json()) as StaffUser;
      })
      .then((currentUser) => {
        if (active && currentUser) {
          setUser(currentUser);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load your staff account.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function logout() {
    setIsLoggingOut(true);
    setError(null);
    try {
      const response = await fetch(`${publicApiBaseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("We couldn't end your session. Please try again.");
      }
      router.replace("/login");
      router.refresh();
    } catch (logoutError: unknown) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "We couldn't end your session. Please try again.",
      );
      setIsLoggingOut(false);
    }
  }

  if (isLoading) {
    return (
      <main
        aria-label="Loading staff workspace"
        className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-6"
        role="status"
      >
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Checking your secure staff session…
        </div>
      </main>
    );
  }

  if (error && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-6">
        <section
          aria-labelledby="session-error-title"
          className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <CircleHelp aria-hidden="true" className="mx-auto size-9 text-amber-600" />
          <h1
            className="mt-4 text-xl font-semibold text-slate-950"
            id="session-error-title"
          >
            Workspace unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600" role="alert">
            {error}
          </p>
          <button
            className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            onClick={() => window.location.reload()}
            type="button"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f5f6fa]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-slate-950"
            href="/dashboard"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <CalendarDays aria-hidden="true" className="size-4" />
            </span>
            Event<span className="-ml-2 text-indigo-600">Hub</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-slate-500">
                {roleLabels[user.role] ?? user.role}
              </p>
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
              disabled={isLoggingOut}
              onClick={logout}
              type="button"
            >
              <LogOut aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">
                {isLoggingOut ? "Signing out…" : "Sign out"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        {error && (
          <p
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="rounded-[2rem] bg-[#11152d] px-6 py-10 text-white shadow-xl shadow-indigo-950/10 sm:px-10 sm:py-12">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-indigo-200">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </div>
          <p className="mt-7 text-sm font-medium text-indigo-200">
            {roleLabels[user.role] ?? "EventHub staff"}
          </p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome to your workspace, {user.firstName}.
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-300">
            You’re signed in securely. Your event-management workspace is
            taking shape — start by exploring the events available to your
            Academy.
          </p>
          <Link
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-indigo-950 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            href="/events"
          >
            Explore events
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <section aria-labelledby="account-heading" className="mt-8">
          <h2 className="text-lg font-semibold text-slate-950" id="account-heading">
            Account
          </h2>
          <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Signed in as
              </p>
              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                {user.email}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Access level
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {roleLabels[user.role] ?? user.role}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
