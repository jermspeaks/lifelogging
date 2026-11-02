import type { Api } from "../api";
import type { Goal, GoalPatch, GoalStatus, GoalSummary, NewGoal } from "../types";
import { addDays, todayLocal } from "../date";

type GoalsApi = Pick<
  Api,
  | "listGoals"
  | "createGoal"
  | "updateGoal"
  | "setGoalStatus"
  | "deleteGoal"
  | "reorderGoals"
  | "logGoalProgress"
>;

function fail(kind: "NotFound" | "Validation", message: string): never {
  throw { kind, message };
}

function dateTimestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail("Validation", `Date must be a valid YYYY-MM-DD date: ${value}`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    fail("Validation", `Date must be a valid YYYY-MM-DD date: ${value}`);
  return date.getTime();
}

function dayCount(from: string, to: string): number {
  return Math.round((dateTimestamp(to) - dateTimestamp(from)) / 86_400_000);
}

export function createGoalsMock(): GoalsApi {
  let nextId = 1;
  const goals = new Map<number, Goal>();
  const progress = new Map<number, Map<string, number>>();
  const now = () => new Date().toISOString();
  const active = () =>
    [...goals.values()]
      .filter((goal) => goal.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const nextOrder = () => Math.max(-1, ...active().map((goal) => goal.sortOrder)) + 1;

  function validate(input: {
    title: string;
    description: string | null;
    targetValue: number | null;
    unit: string | null;
    dueDate: string | null;
  }) {
    const title = input.title.trim();
    if (!title || Array.from(title).length > 120)
      fail("Validation", "Title must be 1–120 characters.");
    if (input.description && Array.from(input.description).length > 1000)
      fail("Validation", "Description must be at most 1,000 characters.");
    if (
      input.targetValue !== null &&
      (!Number.isFinite(input.targetValue) || input.targetValue <= 0)
    )
      fail("Validation", "Target must be a finite number greater than 0.");
    if (input.unit && Array.from(input.unit).length > 20)
      fail("Validation", "Unit must be at most 20 characters.");
    if (input.targetValue === null && input.unit)
      fail("Validation", "A unit can only be set for a numeric goal.");
    if (input.dueDate) dateTimestamp(input.dueDate);
  }

  function mustGet(id: number): Goal {
    const goal = goals.get(id);
    if (!goal) fail("NotFound", `Goal ${id} not found.`);
    return goal;
  }

  function summary(goal: Goal, today: string): GoalSummary {
    const entries = progress.get(goal.id) ?? new Map<string, number>();
    const current = [...entries.values()].reduce((sum, amount) => sum + amount, 0);
    const percent =
      goal.targetValue === null
        ? null
        : Math.min(100, Math.round((current / goal.targetValue) * 100));
    return {
      goal: { ...goal },
      current,
      todayAmount: entries.get(today) ?? 0,
      percent,
      daysLeft: goal.dueDate === null ? null : dayCount(today, goal.dueDate),
    };
  }

  function list(today: string, includeClosed: boolean): GoalSummary[] {
    dateTimestamp(today);
    const rows = [...goals.values()];
    const activeRows = rows
      .filter((goal) => goal.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const closedRows = rows
      .filter((goal) => goal.status !== "active")
      .sort((a, b) => (b.closedOn ?? "").localeCompare(a.closedOn ?? "") || a.id - b.id);
    return [...activeRows, ...(includeClosed ? closedRows : [])].map((goal) =>
      summary(goal, today),
    );
  }

  function create(input: NewGoal): Goal {
    const title = input.title.trim();
    const description = input.description?.trim() || null;
    const targetValue = input.targetValue ?? null;
    const unit = input.unit?.trim() || null;
    const dueDate = input.dueDate?.trim() || null;
    validate({ title, description, targetValue, unit, dueDate });
    const timestamp = now();
    const goal: Goal = {
      id: nextId++,
      title,
      description,
      targetValue,
      unit,
      dueDate,
      status: "active",
      closedOn: null,
      sortOrder: nextOrder(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    goals.set(goal.id, goal);
    progress.set(goal.id, new Map());
    return { ...goal };
  }

  const today = todayLocal();
  create({ title: "Read 24 books", targetValue: 24, unit: "books", dueDate: addDays(today, 180) });
  create({ title: "Run a half marathon", dueDate: addDays(today, 90) });

  return {
    listGoals: async (today, includeClosed) => list(today, includeClosed),
    createGoal: async (input) => create(input),
    updateGoal: async (id, patch: GoalPatch) => {
      const current = mustGet(id);
      const targetValue = Object.hasOwn(patch, "targetValue")
        ? (patch.targetValue ?? null)
        : current.targetValue;
      const unit =
        targetValue === null
          ? null
          : patch.unit !== undefined
            ? patch.unit.trim() || null
            : current.unit;
      const next: Goal = {
        ...current,
        title: patch.title === undefined ? current.title : patch.title.trim(),
        description:
          patch.description === undefined ? current.description : patch.description.trim() || null,
        targetValue,
        unit,
        dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate.trim() || null,
        updatedAt: now(),
      };
      validate(next);
      goals.set(id, next);
      return { ...next };
    },
    setGoalStatus: async (id, status: GoalStatus, today) => {
      dateTimestamp(today);
      const current = mustGet(id);
      const goal: Goal = {
        ...current,
        status,
        closedOn: status === "active" ? null : today,
        sortOrder:
          status === "active" && current.status !== "active" ? nextOrder() : current.sortOrder,
        updatedAt: now(),
      };
      goals.set(id, goal);
      return { ...goal };
    },
    deleteGoal: async (id) => {
      mustGet(id);
      goals.delete(id);
      progress.delete(id);
    },
    reorderGoals: async (ids) => {
      const activeIds = active().map((goal) => goal.id);
      const same =
        ids.length === activeIds.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => activeIds.includes(id));
      if (!same) fail("Validation", "Reorder list must contain every active goal exactly once.");
      ids.forEach((id, index) => goals.set(id, { ...mustGet(id), sortOrder: index }));
    },
    logGoalProgress: async (goalId, date, today, amount) => {
      dateTimestamp(date);
      dateTimestamp(today);
      const goal = mustGet(goalId);
      if (date > today) fail("Validation", "Progress date cannot be in the future.");
      if (!Number.isFinite(amount) || amount < 0)
        fail("Validation", "Progress amount must be finite and at least 0.");
      if (goal.status !== "active") fail("Validation", "Cannot log progress for a closed goal.");
      if (goal.targetValue === null)
        fail("Validation", "Milestone goals do not track numeric progress.");
      const entries = progress.get(goalId)!;
      if (amount === 0) entries.delete(date);
      else entries.set(date, amount);
      return summary(goal, today);
    },
  };
}
