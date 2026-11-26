"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  ContactRound,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MailCheck,
  Mail,
  QrCode,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { publicApiBaseUrl } from "@/lib/api";

type LoginResponse = {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${publicApiBaseUrl}/api/auth/me`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => {
        if (response.ok) {
          router.replace("/dashboard");
          return;
        }
        if (response.status !== 401) {
          throw new Error("We couldn't verify your current session.");
        }
      })
      .catch((sessionCheckError: unknown) => {
        if (active) {
          setSessionError(
            sessionCheckError instanceof Error
              ? sessionCheckError.message
              : "We couldn't verify your current session.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsCheckingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setError(null);
    setSessionError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${publicApiBaseUrl}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | LoginResponse
        | { message?: string | string[] }
        | null;

      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : null;
        throw new Error(
          Array.isArray(message)
            ? message.join(". ")
            : message ?? "Sign in failed. Check your email and password.",
        );
      }

      if (!payload || !("user" in payload) || !payload.user?.id) {
        throw new Error("The server returned an invalid sign-in response.");
      }

      setPassword("");
      router.replace("/dashboard");
      router.refresh();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We couldn't reach EventHub. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="eh-login min-h-screen bg-[#f5f6fa] lg:grid lg:grid-cols-[1.04fr_0.96fr]">
      <section className="eh-login-hero relative hidden min-h-screen overflow-hidden bg-[#11152d] px-12 py-10 text-white lg:flex lg:flex-col xl:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 top-32 h-96 w-96 rounded-full bg-indigo-500/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 bottom-8 h-96 w-96 rounded-full bg-cyan-400/15 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-indigo-700 shadow-lg shadow-black/15">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            Event<span className="text-indigo-300">Hub</span>
          </span>
        </div>

        <div className="relative my-auto max-w-xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm text-indigo-100">
            <Sparkles aria-hidden="true" className="size-4 text-amber-300" />
            A calmer way to bring people together
          </div>
          <h1 className="text-5xl font-semibold leading-[1.12] tracking-tight xl:text-6xl">
            Great events start with a little less busywork.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            Plan, publish, and welcome your community — all from one thoughtful
            workspace.
          </p>

          <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/20 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">One connected workflow</p>
            <h2 className="mt-2 text-lg font-semibold">From registration to follow-up</h2>
            <div className="mt-4 divide-y divide-white/10">
              {[
                { icon: MailCheck, title: "Attendee registration", detail: "Forms, confirmations, and reminders" },
                { icon: QrCode, title: "Event-day check-in", detail: "Private QR tickets and fast validation" },
                { icon: ContactRound, title: "Customer relationships", detail: "Profiles, notes, tags, and activity" },
              ].map(({ icon: Icon, title, detail }) => (
                <div className="flex items-center gap-3 py-3.5" key={title}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-100"><Icon aria-hidden="true" className="size-4" /></span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-white">{title}</p><p className="mt-0.5 text-xs text-slate-400">{detail}</p></div>
                  <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-300" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="relative text-sm text-slate-400">
          Made for the people who make Academy events happen.
        </p>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:justify-center lg:px-12 xl:px-20">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8 lg:flex-none">
          <Link
            aria-label="EventHub home"
            className="mb-10 inline-flex w-fit items-center gap-2.5 text-lg font-semibold tracking-tight text-slate-950 lg:hidden"
            href="/"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <CalendarDays aria-hidden="true" className="size-4" />
            </span>
            Event<span className="-ml-2 text-indigo-600">Hub</span>
          </Link>

          <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold tracking-wide text-indigo-700">
            <LockKeyhole aria-hidden="true" className="size-3.5" />
            SECURE STAFF ACCESS
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Welcome back
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Sign in to your EventHub workspace and pick up where you left off.
          </p>

          <div className="mt-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-32px_rgba(30,41,59,0.28)] sm:p-8">
            {isCheckingSession ? (
              <div
                aria-live="polite"
                className="flex min-h-64 flex-col items-center justify-center text-center"
                role="status"
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="size-7 animate-spin text-indigo-600"
                />
                <p className="mt-4 text-sm text-slate-600">
                  Checking your session…
                </p>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={submit}>
                {sessionError && (
                  <p
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
                    role="status"
                  >
                    {sessionError} You can still try to sign in.
                  </p>
                )}

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-800"
                    htmlFor="email"
                  >
                    Work email
                  </label>
                  <div className="relative">
                    <Mail
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400"
                    />
                    <input
                      autoComplete="username"
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 aria-invalid:border-red-400 aria-invalid:focus:ring-red-500/10"
                      id="email"
                      name="email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@academy.edu"
                      required
                      type="email"
                      value={email}
                      aria-invalid={Boolean(error)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      className="text-sm font-medium text-slate-800"
                      htmlFor="password"
                    >
                      Password
                    </label>
                    <span className="text-xs text-slate-500">
                      Contact your admin if you need help
                    </span>
                  </div>
                  <div className="relative">
                    <KeyRound
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400"
                    />
                    <input
                      autoComplete="current-password"
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-12 text-base text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 aria-invalid:border-red-400 aria-invalid:focus:ring-red-500/10"
                      id="password"
                      name="password"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "login-error" : undefined}
                    />
                    <button
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="size-[18px]" />
                      ) : (
                        <Eye aria-hidden="true" className="size-[18px]" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                    id="login-error"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                <button
                  className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-65"
                  disabled={isSubmitting || !email || !password}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-[18px] animate-spin"
                      />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in securely
                      <ArrowRight
                        aria-hidden="true"
                        className="size-[18px] transition-transform group-hover:translate-x-0.5"
                      />
                    </>
                  )}
                </button>

                <p className="text-center text-xs leading-5 text-slate-500">
                  Your account is protected with secure, encrypted sign-in.
                </p>
              </form>
            )}
          </div>

          <p className="mt-7 text-center text-sm text-slate-600">
            Attending an event?{" "}
            <Link
              className="font-semibold text-indigo-700 underline-offset-4 hover:underline"
              href="/events"
            >
              Explore public events
            </Link>
          </p>
        </div>
        <footer className="mx-auto w-full max-w-md py-3 text-center text-xs text-slate-500">
          © EventHub · Academy event management
        </footer>
      </section>
    </main>
  );
}
