import type { SQLiteDatabase } from "expo-sqlite";
import type {
  Contribution,
  CreateContributionInput,
  CreateSavingsGoalInput,
  GoalBalanceReconciliation,
  SavingsGoal,
  SavingsGoalWithBalance,
  UpdateSavingsGoalInput,
} from "../types/database";

/**
 * Savings goals and their contribution ledger.
 *
 * The contributions table is the source of truth for a goal's balance. Every
 * contribution insert/delete updates `savings_goals.current_amount` in the
 * same transaction, so the cached column can never drift from
 * `SUM(contributions.amount)`. `reconcileGoalBalance` re-derives and repairs
 * it if that invariant is ever broken.
 *
 * All amounts are integer kobo.
 */

const GOAL_COLUMNS =
  "id, name, target_amount, current_amount, target_date, note, created_at, updated_at";
const CONTRIBUTION_COLUMNS = "id, goal_id, amount, date, note, created_at";

/** The sum of a goal's contributions, derived in SQL. */
const BALANCE_SELECT = `
  SELECT
    g.${GOAL_COLUMNS.split(", ").join(", g.")},
    COALESCE(c.balance, 0) AS balance,
    CASE WHEN g.target_amount > 0
      THEN MAX(0, g.target_amount - COALESCE(c.balance, 0))
      ELSE 0
    END AS remaining,
    COALESCE(c.contribution_count, 0) AS contribution_count
  FROM savings_goals g
  LEFT JOIN (
    SELECT goal_id, SUM(amount) AS balance, COUNT(*) AS contribution_count
    FROM contributions
    GROUP BY goal_id
  ) c ON c.goal_id = g.id
`;

/**
 * Validates a real calendar date, not just the YYYY-MM-DD shape. SQLite cannot
 * check this: the table's GLOB constraint accepts values like 2026-99-99, so
 * this is the only place a nonsense date can be rejected.
 */
function assertRealDate(value: string, field: string): string {
  const date = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Invalid ${field}: expected YYYY-MM-DD, received "${date}".`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`Invalid ${field}: "${date}" is not a real calendar date.`);
  }
  return date;
}

function assertPositiveId(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${field}: expected a positive integer.`);
  }
  return value;
}

function assertPositiveKobo(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `Invalid ${field}: expected a positive integer amount in kobo, received ${String(value)}.`
    );
  }
  return value;
}

function assertNonNegativeKobo(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Invalid ${field}: expected a non-negative integer amount in kobo, received ${String(value)}.`
    );
  }
  return value;
}

function assertName(value: string): string {
  const name = value?.trim() ?? "";
  if (name.length === 0) {
    throw new Error("Goal name is required.");
  }
  return name;
}

function normalizeOptionalDate(
  value: string | null | undefined,
  field: string
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return assertRealDate(value, field);
}

function assertValidDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertRealDate(value, field);
}

function toGoalWithBalance(row: Record<string, unknown>): SavingsGoalWithBalance {
  const target = Number(row.target_amount);
  const balance = Number(row.balance);
  return {
    id: Number(row.id),
    name: String(row.name),
    target_amount: target,
    current_amount: Number(row.current_amount),
    target_date: row.target_date === null ? null : String(row.target_date),
    note: String(row.note ?? ""),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    balance,
    remaining: Number(row.remaining),
    percent_complete: target > 0 ? Math.round((balance / target) * 100) : 0,
    is_reached: balance >= target,
    contribution_count: Number(row.contribution_count),
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Goals                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates a goal. A non-zero `current_amount` is recorded as an opening
 * contribution so the ledger reflects the full balance from day one.
 */
export async function createGoal(
  db: SQLiteDatabase,
  input: CreateSavingsGoalInput
): Promise<SavingsGoal> {
  const name = assertName(input.name);
  const targetAmount = assertPositiveKobo(input.target_amount, "target amount");
  const opening = assertNonNegativeKobo(input.current_amount ?? 0, "current amount");
  const targetDate = normalizeOptionalDate(input.target_date, "target date");
  const note = input.note?.trim() ?? "";

  let goalId = 0;
  await db.withTransactionAsync(async () => {
    const inserted = await db.runAsync(
      `INSERT INTO savings_goals (name, target_amount, current_amount, target_date, note)
       VALUES (?, ?, ?, ?, ?)`,
      name,
      targetAmount,
      opening,
      targetDate,
      note
    );
    goalId = inserted.lastInsertRowId;
    if (opening > 0) {
      await db.runAsync(
        `INSERT INTO contributions (goal_id, amount, date, note)
         VALUES (?, ?, date('now'), ?)`,
        goalId,
        opening,
        "Opening balance"
      );
    }
  });

  const goal = await getGoalById(db, goalId);
  if (!goal) {
    throw new Error("Failed to create savings goal.");
  }
  return goal;
}

export async function getGoalById(
  db: SQLiteDatabase,
  id: number
): Promise<SavingsGoal | null> {
  assertPositiveId(id, "goal id");
  return db.getFirstAsync<SavingsGoal>(
    `SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE id = ?`,
    id
  );
}

export async function getAllGoals(db: SQLiteDatabase): Promise<SavingsGoal[]> {
  return db.getAllAsync<SavingsGoal>(
    `SELECT ${GOAL_COLUMNS} FROM savings_goals ORDER BY created_at DESC, id DESC`
  );
}

export async function goalExists(db: SQLiteDatabase, id: number): Promise<boolean> {
  assertPositiveId(id, "goal id");
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM savings_goals WHERE id = ?",
    id
  );
  return (row?.count ?? 0) > 0;
}

export async function getGoalWithBalance(
  db: SQLiteDatabase,
  id: number
): Promise<SavingsGoalWithBalance | null> {
  assertPositiveId(id, "goal id");
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `${BALANCE_SELECT} WHERE g.id = ?`,
    id
  );
  return row ? toGoalWithBalance(row) : null;
}

export async function getGoalsWithBalances(
  db: SQLiteDatabase
): Promise<SavingsGoalWithBalance[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${BALANCE_SELECT} ORDER BY g.created_at DESC, g.id DESC`
  );
  return rows.map(toGoalWithBalance);
}

/**
 * Updates goal details. The balance is intentionally not editable here: it is
 * owned by the contributions ledger. Add or delete a contribution instead.
 */
export async function updateGoal(
  db: SQLiteDatabase,
  id: number,
  fields: UpdateSavingsGoalInput
): Promise<SavingsGoal | null> {
  assertPositiveId(id, "goal id");

  const assignments: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.name !== undefined) {
    assignments.push("name = ?");
    values.push(assertName(fields.name));
  }
  if (fields.target_amount !== undefined) {
    assignments.push("target_amount = ?");
    values.push(assertPositiveKobo(fields.target_amount, "target amount"));
  }
  if (fields.target_date !== undefined) {
    assignments.push("target_date = ?");
    values.push(normalizeOptionalDate(fields.target_date, "target date"));
  }
  if (fields.note !== undefined) {
    assignments.push("note = ?");
    values.push(fields.note.trim());
  }

  if (assignments.length === 0) {
    return getGoalById(db, id);
  }

  assignments.push("updated_at = datetime('now')");
  values.push(id);

  const result = await db.runAsync(
    `UPDATE savings_goals SET ${assignments.join(", ")} WHERE id = ?`,
    ...values
  );
  if (result.changes === 0) {
    return null;
  }
  return getGoalById(db, id);
}

/** Deletes a goal. Its contributions are removed by ON DELETE CASCADE. */
export async function deleteGoal(db: SQLiteDatabase, id: number): Promise<boolean> {
  assertPositiveId(id, "goal id");
  const result = await db.runAsync("DELETE FROM savings_goals WHERE id = ?", id);
  return result.changes > 0;
}

/* -------------------------------------------------------------------------- */
/*                             Contributions                                 */
/* -------------------------------------------------------------------------- */

/**
 * Records a contribution and moves the goal balance by the same amount in one
 * transaction. Rejects zero, negative and non-integer amounts, and unknown
 * goals.
 */
export async function createContribution(
  db: SQLiteDatabase,
  input: CreateContributionInput
): Promise<Contribution> {
  const goalId = assertPositiveId(input.goal_id, "goal id");
  const amount = assertPositiveKobo(input.amount, "contribution amount");
  const date = assertValidDate(input.date, "contribution date");
  const note = input.note?.trim() ?? "";

  if (!(await goalExists(db, goalId))) {
    throw new Error(`Cannot add a contribution: goal ${goalId} does not exist.`);
  }

  let contributionId = 0;
  await db.withTransactionAsync(async () => {
    const inserted = date
      ? await db.runAsync(
          `INSERT INTO contributions (goal_id, amount, date, note) VALUES (?, ?, ?, ?)`,
          goalId,
          amount,
          date,
          note
        )
      : await db.runAsync(
          `INSERT INTO contributions (goal_id, amount, note) VALUES (?, ?, ?)`,
          goalId,
          amount,
          note
        );

    await db.runAsync(
      `UPDATE savings_goals
       SET current_amount = current_amount + ?, updated_at = datetime('now')
       WHERE id = ?`,
      amount,
      goalId
    );
    contributionId = inserted.lastInsertRowId;
  });

  const contribution = await getContributionById(db, contributionId);
  if (!contribution) {
    throw new Error("Failed to create contribution.");
  }
  return contribution;
}

export async function getContributionById(
  db: SQLiteDatabase,
  id: number
): Promise<Contribution | null> {
  assertPositiveId(id, "contribution id");
  return db.getFirstAsync<Contribution>(
    `SELECT ${CONTRIBUTION_COLUMNS} FROM contributions WHERE id = ?`,
    id
  );
}

export async function getContributionsByGoal(
  db: SQLiteDatabase,
  goalId: number
): Promise<Contribution[]> {
  assertPositiveId(goalId, "goal id");
  return db.getAllAsync<Contribution>(
    `SELECT ${CONTRIBUTION_COLUMNS} FROM contributions
     WHERE goal_id = ?
     ORDER BY date DESC, id DESC`,
    goalId
  );
}

/** The goal balance derived from the ledger, ignoring the cached column. */
export async function getGoalBalance(db: SQLiteDatabase, goalId: number): Promise<number> {
  assertPositiveId(goalId, "goal id");
  const row = await db.getFirstAsync<{ balance: number }>(
    "SELECT COALESCE(SUM(amount), 0) as balance FROM contributions WHERE goal_id = ?",
    goalId
  );
  return row?.balance ?? 0;
}

export async function getTotalContributed(
  db: SQLiteDatabase,
  goalId: number
): Promise<number> {
  return getGoalBalance(db, goalId);
}

/**
 * Removes a contribution and subtracts it from the goal balance. The balance
 * cannot go negative because contributions are positive and the cached
 * balance is the sum of them.
 */
export async function deleteContribution(
  db: SQLiteDatabase,
  id: number
): Promise<boolean> {
  assertPositiveId(id, "contribution id");

  let deleted = false;
  await db.withTransactionAsync(async () => {
    const contribution = await getContributionById(db, id);
    if (!contribution) {
      return;
    }
    await db.runAsync("DELETE FROM contributions WHERE id = ?", id);
    await db.runAsync(
      `UPDATE savings_goals
       SET current_amount = current_amount - ?, updated_at = datetime('now')
       WHERE id = ?`,
      contribution.amount,
      contribution.goal_id
    );
    deleted = true;
  });
  return deleted;
}

/* -------------------------------------------------------------------------- */
/*                              Balance integrity                            */
/* -------------------------------------------------------------------------- */

/**
 * Re-derives a goal's balance from its contributions and repairs the cached
 * `current_amount` when the two disagree. Returns what was found.
 */
export async function reconcileGoalBalance(
  db: SQLiteDatabase,
  goalId: number
): Promise<GoalBalanceReconciliation> {
  assertPositiveId(goalId, "goal id");
  const goal = await getGoalById(db, goalId);
  if (!goal) {
    throw new Error(`Cannot reconcile: goal ${goalId} does not exist.`);
  }

  const derived = await getGoalBalance(db, goalId);
  const cached = goal.current_amount;
  if (cached === derived) {
    return { goal_id: goalId, cached, derived, corrected: false };
  }

  await db.runAsync(
    "UPDATE savings_goals SET current_amount = ? WHERE id = ?",
    derived,
    goalId
  );
  return { goal_id: goalId, cached, derived, corrected: true };
}
