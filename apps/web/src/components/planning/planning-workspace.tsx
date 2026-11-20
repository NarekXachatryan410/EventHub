"use client";

import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { staffApi, type StaffEvent, type StaffRole, type StaffUser } from "@/lib/staff-api";

type PlanningTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";

type PlanningTemplateTask = {
  id: string;
  title: string;
  description: string | null;
  daysBeforeEvent: number | null;
};

type PlanningTemplate = {
  id: string;
  name: string;
  description: string | null;
  eventType: string;
  isSystem: boolean;
  tasks: PlanningTemplateTask[];
};

type PlanningTask = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: PlanningTaskStatus;
  completedAt: string | null;
  assignedTo: Pick<StaffUser, "id" | "firstName" | "lastName" | "email"> | null;
};

type EventChecklist = {
  id: string;
  event: Pick<StaffEvent, "id" | "title" | "type" | "startDate">;
  template: { id: string; name: string } | null;
  tasks: PlanningTask[];
};

type AssignableStaff = Pick<StaffUser, "id" | "firstName" | "lastName" | "email"> & {
  role: StaffRole;
};

const taskStatuses: { value: PlanningTaskStatus; label: string }[] = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "BLOCKED", label: "Blocked" },
];

const eventTypes = [
  ["GRADUATION_CEREMONY", "Graduation ceremony"],
  ["GUEST_VISIT", "Guest visit"],
  ["MEETUP", "Partner event"],
  ["OPEN_DAY", "Open day"],
  ["WORKSHOP", "Workshop"],
  ["INFORMATION_SESSION", "Information session"],
  ["OTHER", "Other"],
] as const;

export function PlanningWorkspace() {
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [templates, setTemplates] = useState<PlanningTemplate[]>([]);
  const [staff, setStaff] = useState<AssignableStaff[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [checklist, setChecklist] = useState<EventChecklist | null>(null);
  const [loadedChecklistEventId, setLoadedChecklistEventId] = useState("");
  const [loading, setLoading] = useState(true);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState<string>("GRADUATION_CEREMONY");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateTasks, setTemplateTasks] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      staffApi<StaffEvent[]>("/events/manage"),
      staffApi<PlanningTemplate[]>("/planning/templates"),
      staffApi<AssignableStaff[]>("/planning/staff"),
    ])
      .then(([eventRows, templateRows, staffRows]) => {
        if (!active) return;
        setEvents(eventRows);
        setTemplates(templateRows);
        setStaff(staffRows);
        if (eventRows[0]) setSelectedEventId(eventRows[0].id);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load planning data.",
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

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }
    let active = true;
    staffApi<EventChecklist | null>(
      `/events/${selectedEventId}/planning-checklist`,
    )
      .then((eventChecklist) => {
        if (active) {
          setChecklist(eventChecklist);
          setSelectedTemplateId("");
          setLoadedChecklistEventId(selectedEventId);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setLoadedChecklistEventId(selectedEventId);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load the event checklist.",
          );
        }
      })
    return () => {
      active = false;
    };
  }, [selectedEventId]);

  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const checklistLoading =
    checklistSaving ||
    (selectedEventId !== "" && loadedChecklistEventId !== selectedEventId);
  const matchingTemplates = useMemo(
    () => templates.filter((template) => template.eventType === selectedEvent?.type),
    [selectedEvent?.type, templates],
  );
  const completedCount = checklist?.tasks.filter(
    (task) => task.status === "COMPLETED",
  ).length ?? 0;
  const progress = checklist?.tasks.length
    ? Math.round((completedCount / checklist.tasks.length) * 100)
    : 0;

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const taskTitles = templateTasks
      .split("\n")
      .map((task) => task.trim())
      .filter(Boolean);
    if (taskTitles.length === 0) {
      setError("Add at least one task to the template.");
      return;
    }
    setCreatingTemplate(true);
    setError(null);
    try {
      const created = await staffApi<PlanningTemplate>("/planning/templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          eventType: templateType,
          tasks: taskTitles.map((title) => ({ title })),
        }),
      });
      setTemplates((current) => [...current, created]);
      setTemplateName("");
      setTemplateDescription("");
      setTemplateTasks("");
      setTemplateFormOpen(false);
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create the planning template.",
      );
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function createChecklist() {
    if (!selectedEventId || !selectedTemplateId) return;
    setChecklistSaving(true);
    setError(null);
    try {
      const created = await staffApi<EventChecklist>(
        `/events/${selectedEventId}/planning-checklist`,
        {
          method: "POST",
          body: JSON.stringify({ templateId: selectedTemplateId }),
        },
      );
      setChecklist(created);
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create the event checklist.",
      );
    } finally {
      setChecklistSaving(false);
    }
  }

  async function updateTask(taskId: string, changes: Record<string, unknown>) {
    setSavingTaskId(taskId);
    setError(null);
    try {
      const updated = await staffApi<PlanningTask>(`/planning/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setChecklist((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((task) =>
                task.id === taskId ? updated : task,
              ),
            }
          : current,
      );
    } catch (updateError: unknown) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update the planning task.",
      );
    } finally {
      setSavingTaskId(null);
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEventId || !newTaskTitle.trim()) return;
    setAddingTask(true);
    setError(null);
    try {
      const created = await staffApi<PlanningTask>(
        `/events/${selectedEventId}/planning-checklist/tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            title: newTaskTitle.trim(),
            ...(newTaskDueDate
              ? { dueAt: new Date(`${newTaskDueDate}T12:00:00`).toISOString() }
              : {}),
          }),
        },
      );
      setChecklist((current) =>
        current ? { ...current, tasks: [...current.tasks, created] } : current,
      );
      setNewTaskTitle("");
      setNewTaskDueDate("");
    } catch (addError: unknown) {
      setError(
        addError instanceof Error ? addError.message : "Could not add the task.",
      );
    } finally {
      setAddingTask(false);
    }
  }

  async function deleteTask(taskId: string) {
    setError(null);
    try {
      await staffApi<{ success: boolean }>(`/planning/tasks/${taskId}`, {
        method: "DELETE",
      });
      setChecklist((current) =>
        current
          ? { ...current, tasks: current.tasks.filter((task) => task.id !== taskId) }
          : current,
      );
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the task.",
      );
    }
  }

  return (
    <main>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-indigo-700">Event operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Planning checklists
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Start with a reusable plan, assign owners, and keep deadlines and
            progress visible for each event.
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => setTemplateFormOpen((open) => !open)}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          Create template
        </button>
      </header>

      {error && (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {templateFormOpen && (
        <form
          className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
          onSubmit={createTemplate}
        >
          <div className="md:col-span-2">
            <h2 className="font-semibold text-slate-950">New planning template</h2>
            <p className="mt-1 text-sm text-slate-500">
              One task per line. Templates are reusable for events of the same type.
            </p>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Template name
            <input
              className="h-10 rounded-lg border border-slate-300 px-3 font-normal"
              maxLength={120}
              onChange={(event) => setTemplateName(event.target.value)}
              required
              value={templateName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Event type
            <select
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 font-normal"
              onChange={(event) => setTemplateType(event.target.value)}
              value={templateType}
            >
              {eventTypes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700 md:col-span-2">
            Description
            <input
              className="h-10 rounded-lg border border-slate-300 px-3 font-normal"
              maxLength={1000}
              onChange={(event) => setTemplateDescription(event.target.value)}
              value={templateDescription}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700 md:col-span-2">
            Tasks
            <textarea
              className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 font-normal"
              onChange={(event) => setTemplateTasks(event.target.value)}
              placeholder={"Confirm venue\nPrepare attendee list\nAssign event-day roles"}
              required
              value={templateTasks}
            />
          </label>
          <div className="flex justify-end gap-2 md:col-span-2">
            <button
              className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
              onClick={() => setTemplateFormOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              disabled={creatingTemplate}
              type="submit"
            >
              {creatingTemplate ? "Creating…" : "Create template"}
            </button>
          </div>
        </form>
      )}

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <label className="grid max-w-xl gap-1.5 text-sm font-semibold text-slate-700" htmlFor="planning-event">
              Choose an event
              <select
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 font-normal"
                disabled={loading}
                id="planning-event"
                onChange={(event) => {
                  setError(null);
                  setSelectedEventId(event.target.value);
                }}
                value={selectedEventId}
              >
                <option value="">Select an event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} · {new Date(event.startDate).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {checklist && (
            <div className="min-w-52 sm:w-64">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                <span>Checklist progress</span>
                <span>{completedCount}/{checklist.tasks.length} complete</span>
              </div>
              <div aria-label={`${progress}% complete`} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="img">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      </section>

      {loading || checklistLoading ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500" role="status">
          Loading planning workspace…
        </div>
      ) : !selectedEvent ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <CalendarDays aria-hidden="true" className="mx-auto size-9 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-900">Select an event to get started</h2>
          <p className="mt-1 text-sm text-slate-500">Events you can manage will appear in the list.</p>
        </div>
      ) : !checklist ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
          <ClipboardCheck aria-hidden="true" className="mx-auto size-10 text-indigo-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-950">No checklist yet</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
            Select a {labelForType(selectedEvent.type).toLowerCase()} template to create a checklist for {selectedEvent.title}.
          </p>
          {matchingTemplates.length > 0 ? (
            <div className="mx-auto mt-5 flex max-w-lg flex-col gap-3 sm:flex-row">
              <select
                aria-label="Planning template"
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                value={selectedTemplateId}
              >
                <option value="">Choose template</option>
                {matchingTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}{template.isSystem ? " · Recommended" : ""}
                  </option>
                ))}
              </select>
              <button
                className="h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={!selectedTemplateId}
                onClick={createChecklist}
                type="button"
              >
                Create checklist
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-amber-700">
              No template exists for this event type. Create one above to continue.
            </p>
          )}
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold text-slate-950">{checklist.event.title}</h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <ClipboardCheck aria-hidden="true" className="size-4" />
                {checklist.template?.name ?? "Custom checklist"}
                <span>·</span>
                <CalendarDays aria-hidden="true" className="size-4" />
                {new Date(checklist.event.startDate).toLocaleDateString()}
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              {checklist.tasks.length} {checklist.tasks.length === 1 ? "task" : "tasks"}
            </span>
          </div>

          {checklist.tasks.length === 0 ? (
            <div className="px-5 py-9 text-center text-sm text-slate-500">
              Your checklist is empty. Add a task below to begin planning.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {checklist.tasks.map((task) => (
                <li className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(140px,0.8fr)_minmax(170px,0.9fr)_minmax(140px,0.7fr)_auto] lg:items-center" key={task.id}>
                  <div className="min-w-0">
                    <p className={`font-medium ${task.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-900"}`}>
                      {task.title}
                    </p>
                    {task.description && <p className="mt-1 text-xs text-slate-500">{task.description}</p>}
                    {task.dueAt && isOverdue(task) && (
                      <p className="mt-1 text-xs font-medium text-red-600">Overdue</p>
                    )}
                  </div>
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Status
                    <select
                      aria-label={`Status for ${task.title}`}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium normal-case tracking-normal text-slate-700"
                      disabled={savingTaskId === task.id}
                      onChange={(event) => updateTask(task.id, { status: event.target.value })}
                      value={task.status}
                    >
                      {taskStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <span className="flex items-center gap-1"><Users aria-hidden="true" className="size-3" />Assigned to</span>
                    <select
                      aria-label={`Assignee for ${task.title}`}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium normal-case tracking-normal text-slate-700"
                      disabled={savingTaskId === task.id}
                      onChange={(event) => updateTask(task.id, { assignedToId: event.target.value || null })}
                      value={task.assignedTo?.id ?? ""}
                    >
                      <option value="">Unassigned</option>
                      {staff.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.firstName} {member.lastName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Due date
                    <input
                      aria-label={`Due date for ${task.title}`}
                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-medium normal-case tracking-normal text-slate-700"
                      disabled={savingTaskId === task.id}
                      onChange={(event) =>
                        updateTask(task.id, {
                          dueAt: event.target.value
                            ? new Date(`${event.target.value}T12:00:00`).toISOString()
                            : null,
                        })
                      }
                      type="date"
                      value={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ""}
                    />
                  </label>
                  <button
                    aria-label={`Delete ${task.title}`}
                    className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => deleteTask(task.id)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-[minmax(0,1fr)_190px_auto]" onSubmit={addTask}>
            <label className="sr-only" htmlFor="new-planning-task">Task title</label>
            <input
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              id="new-planning-task"
              maxLength={200}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Add a planning task"
              required
              value={newTaskTitle}
            />
            <label className="sr-only" htmlFor="new-planning-due-date">Due date</label>
            <input
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              id="new-planning-due-date"
              onChange={(event) => setNewTaskDueDate(event.target.value)}
              type="date"
              value={newTaskDueDate}
            />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={addingTask || !newTaskTitle.trim()}
              type="submit"
            >
              <Plus aria-hidden="true" className="size-4" />
              {addingTask ? "Adding…" : "Add task"}
            </button>
          </form>
        </section>
      )}

      {checklist && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />
          Completed tasks are timestamped and progress updates as tasks change.
          <Clock3 aria-hidden="true" className="ml-1 size-4" />
          Assignments are limited to active planning staff.
        </p>
      )}
    </main>
  );
}

function labelForType(type: string): string {
  return eventTypes.find(([value]) => value === type)?.[1] ?? type.replaceAll("_", " ");
}

function isOverdue(task: PlanningTask): boolean {
  return task.status !== "COMPLETED" && Boolean(task.dueAt && new Date(task.dueAt) < new Date());
}
