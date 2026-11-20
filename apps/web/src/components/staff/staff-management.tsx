"use client";

import {
  Check,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useStaffUser } from "@/components/auth/staff-shell";
import { roleLabel, staffApi, type StaffRole, type StaffUser } from "@/lib/staff-api";

type StaffForm = {
  firstName: string;
  lastName: string;
  email: string;
  role: StaffRole;
  password: string;
};

const emptyForm: StaffForm = {
  firstName: "",
  lastName: "",
  email: "",
  role: "EVENT_MANAGER",
  password: "",
};

export function StaffManagement() {
  const currentUser = useStaffUser();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<StaffForm>(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    try {
      setStaff(await staffApi<StaffUser[]>("/users"));
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load staff accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadStaff);
  }, [loadStaff]);

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await staffApi<StaffUser>("/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm(emptyForm);
      setShowCreate(false);
      setNotice("Staff account created.");
      await loadStaff();
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : "Could not create this account.");
    } finally {
      setCreating(false);
    }
  }

  function beginEdit(user: StaffUser) {
    setEditingId(user.id);
    setEditForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      password: "",
    });
    setError(null);
    setNotice(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSavingId(editingId);
    setError(null);
    setNotice(null);
    const body: Record<string, string> = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      email: editForm.email,
      role: editForm.role,
    };
    if (editForm.password) body.password = editForm.password;
    try {
      await staffApi<StaffUser>(`/users/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditingId(null);
      setNotice("Staff details updated.");
      await loadStaff();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not update this account.");
    } finally {
      setSavingId(null);
    }
  }

  async function setActive(user: StaffUser) {
    const isActive = !user.isActive;
    const confirmation = isActive
      ? `Reactivate ${user.firstName} ${user.lastName}?`
      : `Deactivate ${user.firstName} ${user.lastName}? They will lose access immediately.`;
    if (!window.confirm(confirmation)) return;
    setSavingId(user.id);
    setError(null);
    setNotice(null);
    try {
      await staffApi<StaffUser>(`/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      setNotice(`Account ${isActive ? "reactivated" : "deactivated"}.`);
      await loadStaff();
    } catch (statusError: unknown) {
      setError(statusError instanceof Error ? statusError.message : "Could not update account status.");
    } finally {
      setSavingId(null);
    }
  }

  if (currentUser?.role !== "SUPER_ADMIN") {
    return <AccessDenied />;
  }

  const activeAdmins = staff.filter(
    (member) => member.role === "SUPER_ADMIN" && member.isActive,
  ).length;

  return (
    <main>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-indigo-700">Administration</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Staff Management</h1>
          <p className="mt-2 text-sm text-slate-600">Manage staff access and account roles.</p>
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
          onClick={() => {
            setShowCreate((visible) => !visible);
            setError(null);
            setNotice(null);
          }}
          type="button"
        >
          {showCreate ? <X aria-hidden="true" className="size-4" /> : <UserPlus aria-hidden="true" className="size-4" />}
          {showCreate ? "Close form" : "Add staff member"}
        </button>
      </div>

      {error && <Notice kind="error" message={error} />}
      {notice && <Notice kind="success" message={notice} />}

      {showCreate && (
        <form className="mt-6 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6" onSubmit={createStaff}>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Plus aria-hidden="true" className="size-5" /></span>
            <div>
              <h2 className="font-semibold">Create a staff account</h2>
              <p className="text-sm text-slate-500">A temporary password is set here; share it through a secure channel.</p>
            </div>
          </div>
          <StaffFields form={form} onChange={setForm} includePassword passwordRequired />
          <div className="mt-5 flex justify-end">
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={creating} type="submit">
              {creating ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      )}

      <section aria-label="Staff account summary" className="mt-7 grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total staff" value={staff.length} icon={<Users aria-hidden="true" className="size-5" />} />
        <SummaryCard label="Active accounts" value={staff.filter((member) => member.isActive).length} icon={<Check aria-hidden="true" className="size-5" />} />
        <SummaryCard label="Active Super Admins" value={activeAdmins} icon={<Shield aria-hidden="true" className="size-5" />} />
      </section>

      <section aria-labelledby="staff-list-heading" className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold" id="staff-list-heading">All staff</h2>
          <p className="mt-1 text-sm text-slate-500">Password hashes and authentication tokens are never shown.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-3 p-5" role="status"><div className="h-14 animate-pulse rounded-lg bg-slate-100" /><div className="h-14 animate-pulse rounded-lg bg-slate-100" /></div>
          ) : staff.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">No staff accounts found.</p>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(12rem,1.3fr)_minmax(10rem,1fr)_8rem_10rem] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
                <span>Staff member</span><span>Role</span><span>Status</span><span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-slate-100">
                {staff.map((member) =>
                  editingId === member.id ? (
                    <form className="p-5" key={member.id} onSubmit={saveEdit}>
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">Edit {member.firstName} {member.lastName}</h3>
                          <p className="text-xs text-slate-500">Leave the password empty to keep it unchanged.</p>
                        </div>
                        <button aria-label="Cancel edit" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEditingId(null)} type="button"><X aria-hidden="true" className="size-4" /></button>
                      </div>
                      <StaffFields form={editForm} onChange={setEditForm} includePassword allowSuperAdmin />
                      <div className="mt-4 flex justify-end">
                        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={savingId === member.id} type="submit"><Save aria-hidden="true" className="size-4" />{savingId === member.id ? "Saving…" : "Save changes"}</button>
                      </div>
                    </form>
                  ) : (
                    <article className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(12rem,1.3fr)_minmax(10rem,1fr)_8rem_10rem] md:items-center md:gap-4" key={member.id}>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{member.firstName.slice(0, 1)}{member.lastName.slice(0, 1)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{member.firstName} {member.lastName}{member.id === currentUser.id && <span className="ml-2 text-xs font-normal text-slate-500">You</span>}</p>
                          <p className="truncate text-sm text-slate-500">{member.email}</p>
                        </div>
                      </div>
                      <div className="text-sm text-slate-700"><span className="text-xs text-slate-400 md:hidden">Role · </span>{roleLabel(member.role)}</div>
                      <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${member.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{member.isActive ? "Active" : "Inactive"}</span></div>
                      <div className="flex items-center gap-2 md:justify-end">
                        <button aria-label={`Edit ${member.firstName} ${member.lastName}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50" onClick={() => beginEdit(member)} type="button"><Pencil aria-hidden="true" className="size-3.5" /><span className="sm:inline">Edit</span></button>
                        <button aria-label={`${member.isActive ? "Deactivate" : "Reactivate"} ${member.firstName} ${member.lastName}`} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${member.isActive ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`} disabled={savingId === member.id || (member.id === currentUser.id && member.isActive)} onClick={() => void setActive(member)} type="button">{member.isActive ? <X aria-hidden="true" className="size-3.5" /> : <RotateCcw aria-hidden="true" className="size-3.5" />}{member.isActive ? "Deactivate" : "Reactivate"}</button>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function StaffFields({
  form,
  onChange,
  includePassword,
  passwordRequired = false,
  allowSuperAdmin = false,
}: {
  form: StaffForm;
  onChange: (form: StaffForm) => void;
  includePassword: boolean;
  passwordRequired?: boolean;
  allowSuperAdmin?: boolean;
}) {
  function update<K extends keyof StaffForm>(key: K, value: StaffForm[K]) {
    onChange({ ...form, [key]: value });
  }
  const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10";
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <label className="text-sm font-medium text-slate-700">First name<input className={inputClass} maxLength={80} onChange={(event) => update("firstName", event.target.value)} required value={form.firstName} /></label>
      <label className="text-sm font-medium text-slate-700">Last name<input className={inputClass} maxLength={80} onChange={(event) => update("lastName", event.target.value)} required value={form.lastName} /></label>
      <label className="text-sm font-medium text-slate-700">Work email<input className={inputClass} autoComplete="email" maxLength={254} onChange={(event) => update("email", event.target.value)} required type="email" value={form.email} /></label>
      <label className="text-sm font-medium text-slate-700">Role<select className={inputClass} onChange={(event) => update("role", event.target.value as StaffRole)} value={form.role}><option value="EVENT_MANAGER">Event Manager</option><option value="CHECK_IN_STAFF">Check-in Staff</option>{allowSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}</select></label>
      {includePassword && <label className="text-sm font-medium text-slate-700"><span className="inline-flex items-center gap-1.5"><KeyRound aria-hidden="true" className="size-3.5" />{passwordRequired ? "Temporary password" : "New password (optional)"}</span><input className={inputClass} autoComplete="new-password" minLength={12} onChange={(event) => update("password", event.target.value)} required={passwordRequired} type="password" value={form.password} />{passwordRequired && <span className="mt-1 block text-xs font-normal text-slate-500">At least 12 characters. Share it through a secure channel.</span>}</label>}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <article className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">{icon}</span></article>;
}

function Notice({ kind, message }: { kind: "error" | "success"; message: string }) {
  return <p className={`mt-5 rounded-xl border px-4 py-3 text-sm ${kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role={kind === "error" ? "alert" : "status"}>{message}</p>;
}

function AccessDenied() {
  return <section className="rounded-2xl border border-amber-200 bg-white p-8 text-center"><Shield aria-hidden="true" className="mx-auto size-8 text-amber-600" /><h1 className="mt-3 text-xl font-semibold">Super Admin access required</h1><p className="mt-2 text-sm text-slate-600">Your account cannot manage staff members.</p></section>;
}
