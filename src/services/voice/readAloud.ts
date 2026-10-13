import type {
  BudgetWithCategory,
  Insight,
  SavingsGoalWithBalance,
} from "../../types/database";
import { calculateBudgetProgress } from "../../utils/budget";
import { formatKoboAmount } from "../../utils/money";
import { voiceNothingToRead } from "./responses";
import type { ReadAloudScript, ReadAloudTopic } from "./types";

/**
 * Builds the spoken answers to read-only voice questions.
 *
 * Every figure here comes from data the app already has: the insights module's
 * messages, the budget progress helper and the goal balances. Nothing is
 * recalculated into a second system, and nothing is invented. The prose is kept
 * warm and free of blame so reading a hard number never feels like a scolding.
 */

/** Speaks a kobo amount as "4,000 naira" rather than relying on a symbol. */
export function speechAmount(kobo: number): string {
  return `${formatKoboAmount(kobo).replace("₦", "")} naira`;
}

/**
 * Turns a written insight into speech-friendly text. The naira sign is dropped
 * so a text-to-speech engine reads the number cleanly instead of spelling out
 * a symbol.
 */
export function toSpeechText(text: string): string {
  return text.replace(/₦\s?/g, "").replace(/\s{2,}/g, " ").trim();
}

function emptyScript(topic: ReadAloudTopic): ReadAloudScript {
  return { topic, text: voiceNothingToRead(), empty: true };
}

export function buildInsightsScript(insights: Insight[]): ReadAloudScript {
  if (insights.length === 0) return emptyScript("insights");

  const spoken = insights.map((insight) => toSpeechText(insight.message));
  const text = [
    "Here's what I noticed in what you've recorded.",
    ...spoken,
    "That's everything for now. These are based only on what you've entered.",
  ].join(" ");

  return { topic: "insights", text, empty: false };
}

export interface SpendingSummaryInput {
  label: string;
  totalIncomeKobo: number;
  totalExpensesKobo: number;
}

export function buildSpendingSummaryScript(
  input: SpendingSummaryInput
): ReadAloudScript {
  const { label, totalIncomeKobo, totalExpensesKobo } = input;
  if (totalIncomeKobo <= 0 && totalExpensesKobo <= 0) {
    return emptyScript("spending");
  }

  const sentences: string[] = [];
  if (totalIncomeKobo > 0 && totalExpensesKobo > 0) {
    sentences.push(
      `For ${label}, you recorded ${speechAmount(
        totalIncomeKobo
      )} in income and ${speechAmount(totalExpensesKobo)} in spending.`
    );
    const net = totalIncomeKobo - totalExpensesKobo;
    if (net >= 0) {
      sentences.push(
        `That leaves about ${speechAmount(net)} after your recorded spending.`
      );
    } else {
      sentences.push(
        `Your recorded spending came to about ${speechAmount(
          Math.abs(net)
        )} more than your recorded income. That happens — there's no judgement here.`
      );
    }
  } else if (totalIncomeKobo > 0) {
    sentences.push(
      `For ${label}, you recorded ${speechAmount(
        totalIncomeKobo
      )} in income, with no spending recorded yet.`
    );
  } else {
    sentences.push(
      `For ${label}, you recorded ${speechAmount(
        totalExpensesKobo
      )} in spending, with no income recorded yet.`
    );
  }

  return {
    topic: "spending",
    text: sentences.concat("These are based only on what you've entered.").join(" "),
    empty: false,
  };
}

export function buildBudgetScript(
  budgets: BudgetWithCategory[]
): ReadAloudScript {
  if (budgets.length === 0) {
    return {
      topic: "budgets",
      text: "You haven't set up any budgets yet. Whenever you'd like, we can add one together.",
      empty: true,
    };
  }

  const sentences = ["Here's how your budgets are tracking."];
  for (const budget of budgets) {
    const progress = calculateBudgetProgress(budget);
    const name = budget.category_name;
    switch (progress.status) {
      case "over":
        sentences.push(
          `${name} is a little over its monthly limit, at ${progress.percent}% — about ${speechAmount(
            progress.spent
          )} of the ${speechAmount(progress.limit)} you set. If it helps, we can adjust the limit whenever you like.`
        );
        break;
      case "reached":
        sentences.push(
          `${name} has reached its monthly limit of ${speechAmount(progress.limit)}.`
        );
        break;
      case "near":
        sentences.push(
          `${name} is close to its limit at ${progress.percent}%, with about ${speechAmount(
            progress.remaining
          )} left to spend.`
        );
        break;
      default:
        sentences.push(
          `${name} is comfortably on track, at ${progress.percent}% of its limit.`
        );
        break;
    }
  }
  sentences.push("You're in charge of these — nothing here is a requirement.");

  return { topic: "budgets", text: sentences.join(" "), empty: false };
}

export function buildGoalsScript(
  goals: SavingsGoalWithBalance[]
): ReadAloudScript {
  if (goals.length === 0) {
    return {
      topic: "goals",
      text: "You haven't started any savings goals yet. Whenever you're ready, we can set one up.",
      empty: true,
    };
  }

  const sentences = ["Here's how your savings goals are coming along."];
  for (const goal of goals) {
    if (goal.is_reached) {
      sentences.push(
        `You've reached your ${goal.name} goal — ${speechAmount(
          goal.target_amount
        )} set aside. Nicely done.`
      );
    } else {
      sentences.push(
        `${goal.name} is ${goal.percent_complete}% of the way there, with ${speechAmount(
          goal.balance
        )} saved and about ${speechAmount(goal.remaining)} to go.`
      );
    }
  }
  sentences.push("Progress at any pace is still progress.");

  return { topic: "goals", text: sentences.join(" "), empty: false };
}
