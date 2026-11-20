"use client";

import {
  Activity,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Mail,
  QrCode,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { staffApi, type StaffRole, type StaffUser, roleLabel } from "@/lib/staff-api";

type StaffContextValue = { user: StaffUser | null };
const StaffContext = createContext<StaffContextValue>({ user: null });

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: StaffRole[];
};

const navigation: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["SUPER_ADMIN", "EVENT_MANAGER", "CHECK_IN_STAFF"],
  },
  {
    href: "/dashboard/staff",
    label: "Staff Management",
    icon: Users,
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: CalendarDays,
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/registrations",
    label: "Registrations",
    icon: ClipboardList,
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/check-in",
    label: "Check-in",
    icon: QrCode,
    roles: ["SUPER_ADMIN", "EVENT_MANAGER", "CHECK_IN_STAFF"],
  },
  {
    href: "/dashboard/email-logs",
    label: "Email Logs",
    icon: Mail,
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
];

const restrictedPaths: { path: string; roles: StaffRole[] }[] = [
  { path: "/dashboard/staff", roles: ["SUPER_ADMIN"] },
  { path: "/dashboard/events", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
  { path: "/dashboard/registrations", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
  { path: "/dashboard/email-logs", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
];

export function useStaffUser(): StaffUser | null {
  return useContext(StaffContext).user;
}

export function StaffShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-5"><p className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm" role="status">Loading your secure workspace…</p></main>}>
      <StaffWorkspace>{children}</StaffWorkspace>
    </Suspense>
  );
}

function StaffWorkspace({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    staffApi<StaffUser>("/auth/me")
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((authError: unknown) => {
        if (!active) return;
        if (
          authError instanceof Error &&
          authError.message.includes("401")
        ) {
          router.replace("/login");
          return;
        }
        setError(
          authError instanceof Error
            ? authError.message
            : "Could not verify staff access.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const visibleNavigation = useMemo(
    () => navigation.filter((item) => user && item.roles.includes(user.role)),
    [user],
  );
  const requiredRoles = restrictedPaths.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  )?.roles;
  const canAccessPage = Boolean(
    user && (!requiredRoles || requiredRoles.includes(user.role)),
  );

  async function logout() {
    setLoggingOut(true);
    try {
      await staffApi<{ success: boolean }>("/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (logoutError: unknown) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Could not sign out. Please try again.",
      );
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-5">
        <p className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm" role="status">
          Verifying your secure workspace…
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-5">
        <section className="max-w-md rounded-2xl border border-red-200 bg-white p-7 text-center shadow-sm">
          <Shield aria-hidden="true" className="mx-auto size-8 text-red-600" />
          <h1 className="mt-4 text-lg font-semibold">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-slate-600" role="alert">
            {error ?? "Sign in with an active staff account to continue."}
          </p>
          <Link className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white" href="/login">
            Go to sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <StaffContext.Provider value={{ user }}>
      <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
          <Link className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6 text-lg font-semibold tracking-tight" href="/dashboard">
            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
            Event<span className="-ml-3 text-indigo-600">Hub</span>
          </Link>
          <p className="px-6 pb-2 pt-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Workspace
          </p>
          <nav aria-label="Staff workspace" className="space-y-1 px-3">
            {visibleNavigation.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  <Icon aria-hidden="true" className="size-[18px]" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-slate-100 p-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {user.firstName.slice(0, 1)}{user.lastName.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.firstName} {user.lastName}</p>
                <p className="truncate text-xs text-slate-500">{roleLabel(user.role)}</p>
              </div>
              <button
                aria-label={loggingOut ? "Signing out" : "Sign out"}
                className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600"
                disabled={loggingOut}
                onClick={logout}
                title="Sign out"
                type="button"
              >
                <LogOut aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        </aside>

        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex min-h-[76px] items-center justify-between gap-4 px-4 sm:px-7">
              <div className="flex items-center gap-3 lg:hidden">
                <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <CalendarDays aria-hidden="true" className="size-4" />
                </span>
                <span className="font-semibold">Event<span className="text-indigo-600">Hub</span></span>
              </div>
              <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
                <Activity aria-hidden="true" className="size-4 text-emerald-600" />
                Staff workspace
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-semibold">{user.firstName} {user.lastName}</span>
                  <span className="block text-xs text-slate-500">{roleLabel(user.role)}</span>
                </span>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 lg:hidden"
                  disabled={loggingOut}
                  onClick={logout}
                  type="button"
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  Sign out
                </button>
              </div>
            </div>
            <nav aria-label="Mobile staff navigation" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden">
              {visibleNavigation.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                      active ? "bg-indigo-50 text-indigo-700" : "text-slate-600"
                    }`}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>
          {error && (
            <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-7">
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>
            </div>
          )}
          <div className="mx-auto max-w-7xl px-4 py-7 sm:px-7 sm:py-9">
            {canAccessPage ? children : (
              <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
                <Shield aria-hidden="true" className="mx-auto size-9 text-amber-600" />
                <h1 className="mt-4 text-xl font-semibold">This area is restricted</h1>
                <p className="mt-2 text-sm text-slate-600">Your staff role does not have access to this workspace section.</p>
                <Link className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white" href="/dashboard">Return to dashboard</Link>
              </section>
            )}
          </div>
        </div>
      </div>
    </StaffContext.Provider>
  );
}
