"use client";

import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  ContactRound,
  BellRing,
  Tags,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  QrCode,
  Shield,
  ScrollText,
  Users,
  X,
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
  section: "Overview" | "Operations" | "Audience" | "Insights" | "Administration";
  roles: StaffRole[];
};

const navigation: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    section: "Overview",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER", "CHECK_IN_STAFF"],
  },
  {
    href: "/dashboard/staff",
    label: "Staff Management",
    icon: Users,
    section: "Administration",
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: CalendarDays,
    section: "Operations",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/registrations",
    label: "Registrations",
    icon: ClipboardList,
    section: "Operations",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/check-in",
    label: "Check-in",
    icon: QrCode,
    section: "Operations",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER", "CHECK_IN_STAFF"],
  },
  {
    href: "/dashboard/email-logs",
    label: "Email Logs",
    icon: Mail,
    section: "Insights",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/planning",
    label: "Planning",
    icon: ClipboardCheck,
    section: "Operations",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    icon: BarChart3,
    section: "Insights",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/crm",
    label: "CRM overview",
    icon: ContactRound,
    section: "Audience",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/crm/customers",
    label: "Customers",
    icon: Users,
    section: "Audience",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/crm/segments",
    label: "Segments",
    icon: Tags,
    section: "Audience",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/crm/reminders",
    label: "Reminders",
    icon: BellRing,
    section: "Audience",
    roles: ["SUPER_ADMIN", "EVENT_MANAGER"],
  },
  {
    href: "/dashboard/audit-logs",
    label: "Audit Logs",
    icon: ScrollText,
    section: "Administration",
    roles: ["SUPER_ADMIN"],
  },
];

const restrictedPaths: { path: string; roles: StaffRole[] }[] = [
  { path: "/dashboard/staff", roles: ["SUPER_ADMIN"] },
  { path: "/dashboard/events", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
  { path: "/dashboard/registrations", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
  { path: "/dashboard/email-logs", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
  { path: "/dashboard/planning", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
  { path: "/dashboard/analytics", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
  { path: "/dashboard/crm", roles: ["SUPER_ADMIN", "EVENT_MANAGER"] },
  { path: "/dashboard/audit-logs", roles: ["SUPER_ADMIN"] },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const navigationSections = useMemo(
    () =>
      (["Overview", "Operations", "Audience", "Insights", "Administration"] as const)
        .map((section) => ({
          section,
          items: visibleNavigation.filter((item) => item.section === section),
        }))
        .filter((group) => group.items.length > 0),
    [visibleNavigation],
  );
  const activeItem = visibleNavigation.find(
    (item) => pathname === item.href || (item.href !== "/dashboard" && item.href !== "/dashboard/crm" && pathname.startsWith(`${item.href}/`)),
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
      <div className="eh-workspace">
        <aside className="eh-sidebar fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r lg:flex">
          <Link className="eh-brand-row flex h-[76px] items-center gap-3 border-b px-6 text-lg font-semibold tracking-tight" href="/dashboard">
            <span className="eh-brand-mark flex size-10 items-center justify-center rounded-xl text-white">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
            Event<span className="-ml-3 text-indigo-300">Hub</span>
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-6">
            <nav aria-label="Staff workspace" className="space-y-6">
              {navigationSections.map((group) => (
                <div key={group.section}>
                  <p className="eh-nav-heading px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.17em]">
                    {group.section}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = activeItem?.href === item.href;
                      const Icon = item.icon;
                      return (
                        <Link
                          aria-current={active ? "page" : undefined}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium"
                          href={item.href}
                          key={item.href}
                        >
                          <Icon aria-hidden="true" className="size-[17px] shrink-0 opacity-80" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
          <div className="border-t border-white/10 p-3">
            <div className="eh-account-card flex items-center gap-3 rounded-xl p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-400/20 text-xs font-bold text-indigo-100">
                {user.firstName.slice(0, 1)}{user.lastName.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user.firstName} {user.lastName}</p>
                <p className="truncate text-xs text-slate-400">{roleLabel(user.role)}</p>
              </div>
              <button
                aria-label={loggingOut ? "Signing out" : "Sign out"}
                className="flex size-8 items-center justify-center rounded-lg text-slate-400 focus-visible:outline-2 focus-visible:outline-indigo-300"
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

        <div className="lg:pl-[264px]">
          <header className="eh-topbar sticky top-0 z-20 border-b">
            <div className="flex min-h-[68px] items-center justify-between gap-4 px-4 sm:px-7">
              <div className="flex items-center gap-3 lg:hidden">
                <span className="eh-brand-mark flex size-9 items-center justify-center rounded-xl text-white">
                  <CalendarDays aria-hidden="true" className="size-4" />
                </span>
                <span className="font-semibold">Event<span className="text-indigo-600">Hub</span></span>
              </div>
              <div aria-label="Current section" className="hidden items-center gap-2 text-[13px] text-slate-500 lg:flex">
                <span>Workspace</span><span className="text-slate-300">/</span>
                <span className="font-semibold text-slate-800">{activeItem?.label ?? "Dashboard"}</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-semibold">{user.firstName} {user.lastName}</span>
                  <span className="block text-xs text-slate-500">{roleLabel(user.role)}</span>
                </span>
                <button
                  aria-expanded={mobileMenuOpen}
                  aria-controls="mobile-workspace-navigation"
                  aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
                  className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  type="button"
                >
                  {mobileMenuOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
                </button>
              </div>
            </div>
            <div className={`eh-mobile-menu absolute inset-x-3 top-[calc(100%+0.5rem)] z-40 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border p-3 shadow-xl lg:hidden ${mobileMenuOpen ? "block" : "hidden"}`} id="mobile-workspace-navigation">
                <nav aria-label="Mobile staff workspace" className="space-y-4">
                  {navigationSections.map((group) => (
                    <div key={group.section}>
                      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{group.section}</p>
                      <div className="grid grid-cols-2 gap-1">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const active = activeItem?.href === item.href;
                          return <Link aria-current={active ? "page" : undefined} className={`flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`} href={item.href} key={item.href} onClick={() => setMobileMenuOpen(false)}><Icon aria-hidden="true" className="size-4 shrink-0" />{item.label}</Link>;
                        })}
                      </div>
                    </div>
                  ))}
                  <button className="flex min-h-10 w-full items-center gap-2 rounded-xl border-t border-slate-100 px-3 pt-3 text-left text-sm font-semibold text-slate-600" disabled={loggingOut} onClick={logout} type="button"><LogOut aria-hidden="true" className="size-4" />{loggingOut ? "Signing out…" : "Sign out"}</button>
                </nav>
            </div>
          </header>
          {error && (
            <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-7">
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>
            </div>
          )}
          <div className="eh-page-viewport mx-auto max-w-7xl px-4 py-7 sm:px-7 sm:py-9">
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
