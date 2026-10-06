import type { SQLiteDatabase } from "expo-sqlite";
import type { Insight, InsightTone } from "../types/database";

/**
 * Offline financial insights.
 *
 * Every observation is computed deterministically from the recorded `income`
 * and `expenses` tables. There is no AI, no network and no bank connection:
 * the messages only describe what the user typed into the app, and never claim
 * an actual bank balance.
 *
 * "This month" means the calendar month containing `asOf` (today by default),
 * so an as-of date in the middle of a month compares a partial month against
 * whatever came before it. Amounts are integer kobo.
 *
 * The module only uses `import type`, so Node's type stripping can load it in
 * tests the same way it does for the recurring module.
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// A category must have spent at least this much (in kobo) in a month before we
// make any claim about it. Prevents a stray ₦20 recording from driving a
// "grew 300%!" message.
const MIN_CATEGORY_SPEND_KOBO = 50_000; // ₦500
// Only call out a category increase once it is at least this percentage.
const MIN_GROWTH_PCT = 15;
// "Unusual" = this month is at least this factor above the category's average
// over the previous months, and at least this percentage above it.
const UNUSUAL_SPEND_MULTIPLIER = 1.6;
const UNUSUAL_MIN_ABOVE_PCT = 60;
// How many previous calendar months establish a category's "usual" spend.
const PRIOR_MONTHS_FOR_USUAL = 3;
// A category needs at least this many previous months recorded before its
// average counts as "usual"; one lonely month is not a baseline.
const MIN_PRIOR_MONTHS_RECORDED = 2;

/* -------------------------------------------------------------------------- */
/*                               Date helpers                                 */
/* -------------------------------------------------------------------------- */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(asOfDate: string): string {
  return asOfDate.slice(0, 7);
}

function shiftMonth(key: string, delta: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const total = year * 12 + (month - 1) + delta;
  const targetYear = Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12;
  return `${targetYear}-${pad2(targetMonth + 1)}`;
}

function monthStart(key: string): string {
  return `${key}-01`;
}

function monthEnd(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();
  return `${key}-${pad2(lastDay)}`;
}

function dayParts(dateStr: string): { day: string; month: string; name: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return {
    day: pad2(day),
    month: MONTH_NAMES[month - 1],
    name: DAY_NAMES[weekday],
  };
}

/* -------------------------------------------------------------------------- */
/*                               Money helpers                                */
/* -------------------------------------------------------------------------- */

function formatKobo(kobo: number): string {
  const naira = kobo / 100;
  const [whole, frac] = naira.toFixed(2).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmed = frac === "00" ? withCommas : `${withCommas}.${frac}`;
  return `₦${trimmed}`;
}

/* -------------------------------------------------------------------------- */
/*                                  Queries                                   */
/* -------------------------------------------------------------------------- */

interface CategoryTotalRow {
  category_id: number;
  category_name: string;
  total: number;
  count: number;
}

interface SourceTotalRow {
  source: string;
  total: number;
  count: number;
}

interface DayTotalRow {
  day: string;
  total: number;
}

interface CategoryMonthRow {
  category_id: number;
  ym: string;
  total: number;
}

async function expenseCategoryTotals(
  db: SQLiteDatabase,
  start: string,
  end: string
): Promise<CategoryTotalRow[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
       e.category_id AS category_id,
       COALESCE(c.name, 'Other') AS category_name,
       SUM(e.amount) AS total,
       COUNT(*) AS count
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE substr(e.date, 1, 10) BETWEEN ? AND ?
     GROUP BY e.category_id, c.name
     ORDER BY total DESC`,
    start,
    end
  );
  return rows.map((row) => ({
    category_id: Number(row.category_id),
    category_name: String(row.category_name),
    total: Number(row.total),
    count: Number(row.count),
  }));
}

async function incomeSourceTotals(
  db: SQLiteDatabase,
  start: string,
  end: string
): Promise<SourceTotalRow[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT source AS source, SUM(amount) AS total, COUNT(*) AS count
     FROM income
     WHERE income_date BETWEEN ? AND ?
     GROUP BY source
     ORDER BY total DESC`,
    start,
    end
  );
  return rows.map((row) => ({
    source: String(row.source),
    total: Number(row.total),
    count: Number(row.count),
  }));
}

async function expenseDayTotals(
  db: SQLiteDatabase,
  start: string,
  end: string
): Promise<DayTotalRow[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT substr(date, 1, 10) AS day, SUM(amount) AS total
     FROM expenses
     WHERE substr(date, 1, 10) BETWEEN ? AND ?
     GROUP BY day
     ORDER BY total DESC`,
    start,
    end
  );
  return rows.map((row) => ({
    day: String(row.day),
    total: Number(row.total),
  }));
}

async function incomeDayTotals(
  db: SQLiteDatabase,
  start: string,
  end: string
): Promise<DayTotalRow[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT income_date AS day, SUM(amount) AS total
     FROM income
     WHERE income_date BETWEEN ? AND ?
     GROUP BY income_date
     ORDER BY total DESC`,
    start,
    end
  );
  return rows.map((row) => ({
    day: String(row.day),
    total: Number(row.total),
  }));
}

async function expenseTotals(
  db: SQLiteDatabase,
  start: string,
  end: string
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE substr(date, 1, 10) BETWEEN ? AND ?`,
    start,
    end
  );
  return Number(row?.total ?? 0);
}

async function incomeTotals(
  db: SQLiteDatabase,
  start: string,
  end: string
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM income
     WHERE income_date BETWEEN ? AND ?`,
    start,
    end
  );
  return Number(row?.total ?? 0);
}

async function expenseCategoryByMonth(
  db: SQLiteDatabase,
  startYm: string,
  endYm: string
): Promise<CategoryMonthRow[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT category_id AS category_id,
            substr(date, 1, 7) AS ym,
            SUM(amount) AS total
     FROM expenses
     WHERE substr(date, 1, 7) BETWEEN ? AND ?
     GROUP BY category_id, substr(date, 1, 7)`,
    startYm,
    endYm
  );
  return rows.map((row) => ({
    category_id: Number(row.category_id),
    ym: String(row.ym),
    total: Number(row.total),
  }));
}

/* -------------------------------------------------------------------------- */
/*                               Insight build                                */
/* -------------------------------------------------------------------------- */

interface InsightDraft {
  id: string;
  tone: InsightTone;
  icon: string;
  message: string;
}

function insightOf(draft: InsightDraft): Insight {
  return draft;
}

/**
 * Computes the offline insights for the month containing `asOfDate`.
 *
 * Insight production is guarded so sparse data never produces a misleading
 * conclusion:
 *  - Nothing is returned when the month has no recorded activity.
 *  - Month-over-month percentage messages only fire when both months have data.
 *  - Category growth / unusual spend need a meaningful baseline to compare
 *    against (never a leap from a tiny or missing previous month).
 *  - Savings figures only exist when income was actually recorded, and are
 *    always phrased as "recorded".
 */
export async function computeInsights(
  db: SQLiteDatabase,
  asOfDate: string = todayString()
): Promise<Insight[]> {
  const currentYm = monthKey(asOfDate);
  const currentStart = monthStart(currentYm);
  const currentEnd = monthEnd(currentYm);
  const previousYm = shiftMonth(currentYm, -1);
  const previousStart = monthStart(previousYm);
  const previousEnd = monthEnd(previousYm);

  const [curIncome, curExpenses, prevIncome, prevExpenses] = await Promise.all([
    incomeTotals(db, currentStart, currentEnd),
    expenseTotals(db, currentStart, currentEnd),
    incomeTotals(db, previousStart, previousEnd),
    expenseTotals(db, previousStart, previousEnd),
  ]);

  const hasAnyData = curIncome > 0 || curExpenses > 0;
  if (!hasAnyData) {
    return [];
  }

  const [curCategories, curSources, curExpenseDays, curIncomeDays] =
    await Promise.all([
      expenseCategoryTotals(db, currentStart, currentEnd),
      incomeSourceTotals(db, currentStart, currentEnd),
      expenseDayTotals(db, currentStart, currentEnd),
      incomeDayTotals(db, currentStart, currentEnd),
    ]);

  const insights: Insight[] = [];

  // Summary of recorded activity this month.
  if (curIncome > 0 && curExpenses > 0) {
    insights.push(
      insightOf({
        id: "income-summary",
        tone: "neutral",
        icon: "wallet-outline",
        message: `You recorded ${formatKobo(curIncome)} income and ${formatKobo(
          curExpenses
        )} expenses this month.`,
      })
    );
  } else if (curIncome > 0) {
    insights.push(
      insightOf({
        id: "income-summary",
        tone: "neutral",
        icon: "wallet-outline",
        message: `You recorded ${formatKobo(curIncome)} in income this month.`,
      })
    );
  } else {
    insights.push(
      insightOf({
        id: "income-summary",
        tone: "neutral",
        icon: "wallet-outline",
        message: `You recorded ${formatKobo(curExpenses)} in expenses this month.`,
      })
    );
  }

  // Percentage of recorded income spent.
  if (curIncome > 0) {
    const pctSpent = Math.round((curExpenses / curIncome) * 100);
    insights.push(
      insightOf({
        id: "percent-of-income-spent",
        tone: pctSpent > 100 ? "warning" : "neutral",
        icon: "pie-chart-outline",
        message: `You spent ${pctSpent}% of your recorded income this month.`,
      })
    );
  }

  // Recorded savings rate (income minus expenses over income).
  if (curIncome > 0) {
    const savingsRate = Math.round(((curIncome - curExpenses) / curIncome) * 100);
    if (savingsRate >= 0) {
      insights.push(
        insightOf({
          id: "savings-rate",
          tone: savingsRate > 0 ? "positive" : "neutral",
          icon: "trending-up-outline",
          message: `Your recorded savings rate is ${savingsRate}% this month.`,
        })
      );
    } else {
      insights.push(
        insightOf({
          id: "savings-rate",
          tone: "warning",
          icon: "trending-up-outline",
          message: `Recorded expenses exceeded your recorded income by ${Math.abs(
            savingsRate
          )}% this month.`,
        })
      );
    }
  }

  // Biggest expense category.
  const biggestCategory = curCategories[0];
  if (biggestCategory) {
    insights.push(
      insightOf({
        id: "biggest-expense-category",
        tone: "neutral",
        icon: "pie-chart-outline",
        message: `${
          biggestCategory.category_name
        } is your biggest expense this month: ${formatKobo(
          biggestCategory.total
        )} across ${biggestCategory.count} ${
          biggestCategory.count === 1 ? "transaction" : "transactions"
        }.`,
      })
    );
  }

  // Highest spending day.
  const highestExpenseDay = curExpenseDays[0];
  if (highestExpenseDay && highestExpenseDay.total > 0) {
    const parts = dayParts(highestExpenseDay.day);
    insights.push(
      insightOf({
        id: "highest-spending-day",
        tone: "neutral",
        icon: "calendar-outline",
        message: `Your highest spending day this month was ${parts.name}, ${
          parts.day
        } ${parts.month} (${formatKobo(highestExpenseDay.total)}).`,
      })
    );
  }

  // Biggest income source.
  const biggestSource = curSources[0];
  if (biggestSource) {
    insights.push(
      insightOf({
        id: "biggest-income-source",
        tone: "positive",
        icon: "trending-up-outline",
        message: `${
          biggestSource.source
        } is your biggest income source this month: ${formatKobo(
          biggestSource.total
        )}.`,
      })
    );
  }

  // Highest income day.
  const highestIncomeDay = curIncomeDays[0];
  if (highestIncomeDay && highestIncomeDay.total > 0) {
    const parts = dayParts(highestIncomeDay.day);
    insights.push(
      insightOf({
        id: "highest-income-day",
        tone: "positive",
        icon: "calendar-outline",
        message: `Your highest income day this month was ${parts.name}, ${
          parts.day
        } ${parts.month} (${formatKobo(highestIncomeDay.total)}).`,
      })
    );
  }

  // Total spending compared with the previous month. Only meaningful when both
  // months have real recorded spending; a previous month of ₦20 would turn a
  // normal month into a "+9,000%" soundbite.
  if (curExpenses > 0 && prevExpenses >= MIN_CATEGORY_SPEND_KOBO) {
    const pctChange = Math.round(((curExpenses - prevExpenses) / prevExpenses) * 100);
    let message: string;
    let tone: InsightTone;
    let icon: string;
    if (pctChange > 0) {
      tone = "warning";
      icon = "trending-up";
      message = `You spent ${pctChange}% more this month than last month (${formatKobo(
        curExpenses
      )} vs ${formatKobo(prevExpenses)}).`;
    } else if (pctChange < 0) {
      tone = "positive";
      icon = "trending-down";
      message = `You spent ${Math.abs(pctChange)}% less this month than last month (${formatKobo(
        curExpenses
      )} vs ${formatKobo(prevExpenses)}).`;
    } else {
      tone = "neutral";
      icon = "remove";
      message = `Your spending matched last month (${formatKobo(curExpenses)}).`;
    }
    insights.push(insightOf({ id: "spend-vs-last-month", tone, icon, message }));
  }

  // The category that grew the most versus last month. Needs a meaningful
  // baseline in the previous month so a tiny starting amount cannot explode
  // into an absurd percentage.
  if (curCategories.length > 0) {
    const prevCategories = await expenseCategoryTotals(
      db,
      previousStart,
      previousEnd
    );
    const prevByCategory = new Map(
      prevCategories.map((row) => [row.category_id, row.total])
    );
    let best: { name: string; pct: number; current: number; previous: number } | null =
      null;
    for (const row of curCategories) {
      const previous = prevByCategory.get(row.category_id) ?? 0;
      if (
        previous < MIN_CATEGORY_SPEND_KOBO ||
        row.total < MIN_CATEGORY_SPEND_KOBO
      ) {
        continue;
      }
      const pct = Math.round(((row.total - previous) / previous) * 100);
      if (pct >= MIN_GROWTH_PCT && (!best || pct > best.pct)) {
        best = { name: row.category_name, pct, current: row.total, previous };
      }
    }
    if (best) {
      insights.push(
        insightOf({
          id: "category-growth",
          tone: "warning",
          icon: "trending-up",
          message: `You spent ${best.pct}% more on ${best.name} than last month (${formatKobo(
            best.current
          )} vs ${formatKobo(best.previous)}).`,
        })
      );
    }
  }

  // Unusual spend: this month's category total sits well above its recent
  // monthly average. Requires at least two prior recorded months so the
  // "usual" baseline is not a guess.
  if (curCategories.length > 0) {
    const baselineStartYm = shiftMonth(currentYm, -PRIOR_MONTHS_FOR_USUAL);
    const baselineEndYm = shiftMonth(currentYm, -1);
    const byCategoryMonth = await expenseCategoryByMonth(
      db,
      baselineStartYm,
      baselineEndYm
    );
    const monthlyTotals = new Map<number, Map<string, number>>();
    for (const row of byCategoryMonth) {
      const byMonth = monthlyTotals.get(row.category_id) ?? new Map<string, number>();
      byMonth.set(row.ym, row.total);
      monthlyTotals.set(row.category_id, byMonth);
    }

    let unusual:
      | { name: string; current: number; average: number; pctAbove: number }
      | null = null;
    for (const row of curCategories) {
      const byMonth = monthlyTotals.get(row.category_id);
      if (!byMonth) continue;
      const recordedMonths = Array.from(byMonth.values()).filter(
        (total) => total > 0
      );
      if (recordedMonths.length < MIN_PRIOR_MONTHS_RECORDED) continue;
      const average =
        recordedMonths.reduce((sum, total) => sum + total, 0) / recordedMonths.length;
      if (average < MIN_CATEGORY_SPEND_KOBO || row.total < MIN_CATEGORY_SPEND_KOBO) {
        continue;
      }
      if (row.total < average * UNUSUAL_SPEND_MULTIPLIER) continue;
      const pctAbove = Math.round(((row.total - average) / average) * 100);
      if (pctAbove < UNUSUAL_MIN_ABOVE_PCT) continue;
      if (!unusual || pctAbove > unusual.pctAbove) {
        unusual = { name: row.category_name, current: row.total, average, pctAbove };
      }
    }
    if (unusual) {
      insights.push(
        insightOf({
          id: "unusual-spending",
          tone: "warning",
          icon: "alert-circle-outline",
          message: `${unusual.name} cost ${formatKobo(
            unusual.current
          )} this month — ${unusual.pctAbove}% above your usual monthly spend.`,
        })
      );
    }
  }

  return insights;
}