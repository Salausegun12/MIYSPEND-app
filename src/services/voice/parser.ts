import type { Category, IncomeSource, PaymentMethod } from "../../types/database";
import { INCOME_SOURCES } from "../../types/database";
import { formatKoboAmount, nairaToKobo } from "../../utils/money";
import type {
  VoiceDraft,
  VoiceQuestion,
  VoiceQuestionField,
  VoiceSummaryRow,
} from "./types";
import { getTodayString } from "../../utils/date";

/* ------------------------------------------------------------------ tokens */

/**
 * Lower-cases, normalises apostrophes and removes characters that never carry
 * meaning in a spoken money command. Currency, digit grouping, decimal points,
 * dates and times are preserved for the extractors below.
 */
export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9₦.,/:+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match that also tolerates a trailing plural "s". */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(needle)}(?:s)?\\b`, "i");
  return pattern.test(haystack);
}

/* ------------------------------------------------------------ number words */

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALE_NUMBERS: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;

  for (const raw of words) {
    const word = raw.toLowerCase();
    if (word === "and") continue;

    const small = SMALL_NUMBERS[word];
    if (small !== undefined) {
      current += small;
      seen = true;
      continue;
    }

    const scale = SCALE_NUMBERS[word];
    if (scale !== undefined) {
      seen = true;
      if (scale === 100) {
        current = (current || 1) * 100;
      } else {
        total += (current || 1) * scale;
        current = 0;
      }
      continue;
    }

    return null;
  }

  if (!seen) return null;
  return total + current;
}

/**
 * Finds a spoken-number phrase (e.g. "three thousand", "fifty") and converts
 * it to a value. Only accepts phrases that contain a scale word or sit next to
 * a currency token, so stray words like "one" in "bought one" are ignored.
 */
function parseWordAmount(
  tokens: string[]
): { value: number; matched: string; start: number; end: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    if (
      SMALL_NUMBERS[tokens[i]] === undefined &&
      SCALE_NUMBERS[tokens[i]] === undefined &&
      tokens[i] !== "and"
    ) {
      continue;
    }

    const start = i;
    let end = i;
    while (end < tokens.length) {
      const word = tokens[end];
      if (
        SMALL_NUMBERS[word] !== undefined ||
        SCALE_NUMBERS[word] !== undefined ||
        word === "and"
      ) {
        end += 1;
        continue;
      }
      break;
    }

    const phrase = tokens.slice(start, end);
    const value = wordsToNumber(phrase);
    if (value === null) {
      i = end - 1;
      continue;
    }

    const hasScale = phrase.some((w) => SCALE_NUMBERS[w] !== undefined);
    const before = tokens[start - 1];
    const after = tokens[end];
    const currencyNearby =
      before === "naira" ||
      before === "₦" ||
      after === "naira" ||
      after === "₦";

    if (hasScale || currencyNearby) {
      return {
        value,
        matched: phrase.join(" "),
        start,
        end,
      };
    }

    i = end - 1;
  }

  return null;
}

/* --------------------------------------------------------------- date/time */

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 2000 || year > 2100) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function shiftDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

interface DateExtraction {
  date: string;
  matched: string[];
}

/** Resolves a date phrase relative to today, defaulting to today. */
export function extractDate(
  text: string,
  today: string = getTodayString()
): DateExtraction {
  const matched: string[] = [];

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const built = buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (built) {
      matched.push(iso[0]);
      return { date: built, matched };
    }
  }

  const dmy = text.match(/\b(\d{1,2})[/](\d{1,2})[/](\d{4})\b/);
  if (dmy) {
    const built = buildDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    if (built) {
      matched.push(dmy[0]);
      return { date: built, matched };
    }
  }

  const dayMonth = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)(?:\s+(\d{4}))?\b/
  );
  if (dayMonth && MONTHS[dayMonth[2]]) {
    const year = dayMonth[3]
      ? Number(dayMonth[3])
      : Number(today.slice(0, 4));
    const built = buildDate(year, MONTHS[dayMonth[2]], Number(dayMonth[1]));
    if (built) {
      matched.push(dayMonth[0]);
      return { date: built, matched };
    }
  }

  const monthDay = text.match(
    /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/
  );
  if (monthDay && MONTHS[monthDay[1]]) {
    const year = monthDay[3]
      ? Number(monthDay[3])
      : Number(today.slice(0, 4));
    const built = buildDate(year, MONTHS[monthDay[1]], Number(monthDay[2]));
    if (built) {
      matched.push(monthDay[0]);
      return { date: built, matched };
    }
  }

  if (/\byesterday\b|\blast night\b/.test(text)) {
    matched.push(text.match(/\byesterday\b/)?.[0] ?? "last night");
    return { date: shiftDays(today, -1), matched };
  }

  if (/\btoday\b|\bthis (?:morning|afternoon|evening|night)\b/.test(text)) {
    matched.push(
      text.match(/\btoday\b|\bthis (?:morning|afternoon|evening|night)\b/)?.[0] ??
        "today"
    );
    return { date: today, matched };
  }

  return { date: today, matched };
}

interface TimeExtraction {
  time: string;
  matched: string | null;
}

/** Resolves an "at 3pm"/"3:30pm" phrase, defaulting to the current time. */
export function extractTime(text: string, now: Date = new Date()): TimeExtraction {
  const match = text.match(
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/
  );
  if (match) {
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const period = match[3];
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { time: `${pad(hour)}:${pad(minute)}`, matched: match[0] };
    }
  }

  return {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    matched: null,
  };
}

/* ------------------------------------------------------------------ amount */

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  million: 1_000_000,
  m: 1_000_000,
  billion: 1_000_000_000,
  bn: 1_000_000_000,
  hundred: 100,
};

interface AmountExtraction {
  kobo: number | null;
  invalid: boolean;
}

/**
 * Extracts the most likely amount from a transcript whose date/time phrases
 * have already been removed. Returns kobo, or invalid=true when an amount was
 * said but is unusable (zero or negative).
 */
export function extractAmount(amountText: string): AmountExtraction {
  const tokens = amountText.split(/\s+/).filter(Boolean);
  const numeric =
    /(?:₦\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|million|m|billion|bn|hundred)?/gi;

  let best: { value: number; matched: string; score: number } | null = null;
  let negative = false;
  let match: RegExpExecArray | null;

  while ((match = numeric.exec(amountText)) !== null) {
    const raw = match[1].replace(/,/g, "");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) continue;

    const multiplier = match[2] ? MULTIPLIERS[match[2].toLowerCase()] ?? 1 : 1;
    const value = parsed * multiplier;

    const precededByCurrency = amountText
      .slice(Math.max(0, match.index - 2), match.index)
      .includes("₦");
    const followedByNaira = /^\s*naira\b/i.test(
      amountText.slice(match.index + match[0].length)
    );
    const hasMultiplier = multiplier !== 1;
    const before = amountText.slice(Math.max(0, match.index - 1), match.index);

    if (before === "-") negative = true;

    const score =
      (precededByCurrency || followedByNaira ? 4 : 0) + (hasMultiplier ? 2 : 0);

    if (!best || score > best.score) {
      best = { value, matched: match[0], score };
    }
  }

  if (best) {
    const kobo = nairaToKobo(best.value);
    if (negative || !Number.isFinite(kobo) || kobo <= 0) {
      return { kobo: null, invalid: true };
    }
    return { kobo, invalid: false };
  }

  const wordAmount = parseWordAmount(tokens);
  if (wordAmount) {
    const kobo = nairaToKobo(wordAmount.value);
    if (!Number.isFinite(kobo) || kobo <= 0) {
      return { kobo: null, invalid: true };
    }
    return { kobo, invalid: false };
  }

  return { kobo: null, invalid: false };
}

/* ------------------------------------------------------------- type detect */

const EXPENSE_PATTERNS: RegExp[] = [
  /\bspent\b/,
  /\bspend\b/,
  /\bpaid\b/,
  /\bpay\b/,
  /\bbought\b/,
  /\bbuy\b/,
  /\bpurchase(?:d|s)?\b/,
  /\bexpense(?:s)?\b/,
  /\bcost(?:s)?\b/,
  /\bdebited\b/,
  /\bwithdrew\b/,
];

const INCOME_PATTERNS: RegExp[] = [
  /\breceived\b/,
  /\breceive\b/,
  /\bearned\b/,
  /\bearn\b/,
  /\bincome\b/,
  /\bsalary\b/,
  /\bfreelance\b/,
  /\bcommission\b/,
  /\ballowance\b/,
  /\brefund\b/,
  /\bcredited\b/,
  /\bgot paid\b/,
  /\bwas paid\b/,
  /\bbeen paid\b/,
];

/** Decides whether the command is an expense, income, or ambiguous (null). */
export function detectType(text: string): "expense" | "income" | null {
  // "got paid" is income, but the bare word "paid" is an expense signal, so
  // strip the income phrasing first.
  const forExpense = text.replace(/\b(got|was|been)\s+paid\b/g, " ");
  const expense = EXPENSE_PATTERNS.some((pattern) => pattern.test(forExpense));
  const income = INCOME_PATTERNS.some((pattern) => pattern.test(text));

  if (expense && !income) return "expense";
  if (income && !expense) return "income";
  return null;
}

/* --------------------------------------------------------------- matching */

const CATEGORY_ALIASES: Record<string, string[]> = {
  food: ["food", "lunch", "dinner", "breakfast", "restaurant", "eat", "ate", "snack", "meal"],
  transport: ["transport", "bus", "taxi", "uber", "bolt", "fare", "fuel", "petrol", "ride", "keke"],
  groceries: ["groceries", "grocery", "market", "provisions", "supermarket"],
  airtime: ["airtime", "recharge", "top up", "topup", "top-up", "credit"],
  data: ["data", "internet", "browsing", "subscription"],
  electricity: ["electricity", "light", "nepa", "power", "electric"],
  housing: ["rent", "housing", "house", "accommodation"],
  health: ["health", "hospital", "medicine", "drugs", "pharmacy", "doctor", "clinic"],
  education: ["school", "education", "books", "tuition", "fees", "course", "textbook"],
  family: ["family", "parents", "siblings", "mother", "father"],
  clothing: ["clothing", "clothes", "cloth", "shoe", "shoes", "wear", "tailor"],
  entertainment: ["entertainment", "movie", "cinema", "game", "netflix", "party", "drinks"],
  "business/work": ["business", "work", "office", "staff", "employee"],
  giving: ["giving", "church", "tithe", "offering", "charity", "donation", "donate"],
  other: ["other", "misc", "miscellaneous"],
};

/** Best-effort category match by name or alias, longest names first. */
export function matchCategory(
  text: string,
  categories: Category[]
): Category | null {
  const ordered = [...categories].sort((a, b) => b.name.length - a.name.length);

  for (const category of ordered) {
    const name = category.name.toLowerCase();
    if (containsWord(text, name)) return category;
    const aliases = CATEGORY_ALIASES[name] ?? [];
    if (aliases.some((alias) => containsWord(text, alias))) return category;
  }

  return null;
}

const INCOME_SOURCE_ALIASES: Record<IncomeSource, string[]> = {
  Salary: ["salary", "wages", "paycheck", "monthly pay"],
  Freelance: ["freelance", "gig", "contract", "side hustle", "side job", "client work"],
  Business: ["business", "sales", "shop", "profit", "store", "trade"],
  Allowance: ["allowance", "pocket money", "stipend"],
  Commission: ["commission", "bonus"],
  Gift: ["gift", "present", "gifted"],
  Refund: ["refund", "reimbursement", "cashback", "returned"],
  Other: ["other"],
};

/** Best-effort income source match, ordered so specific sources win. */
export function matchIncomeSource(text: string): IncomeSource | null {
  const ordered: IncomeSource[] = [
    "Salary",
    "Freelance",
    "Business",
    "Allowance",
    "Commission",
    "Gift",
    "Refund",
    "Other",
  ];

  for (const source of ordered) {
    const aliases = INCOME_SOURCE_ALIASES[source];
    if (aliases.some((alias) => containsWord(text, alias))) return source;
  }

  return null;
}

const PAYMENT_ALIASES: { alias: string; method: PaymentMethod }[] = [
  { alias: "bank transfer", method: "Bank Transfer" },
  { alias: "transfer", method: "Bank Transfer" },
  { alias: "debit card", method: "Debit/Credit Card" },
  { alias: "credit card", method: "Debit/Credit Card" },
  { alias: "card", method: "Debit/Credit Card" },
  { alias: "pos", method: "POS" },
  { alias: "ussd", method: "USSD" },
  { alias: "cash", method: "Cash" },
];

export function matchPaymentMethod(text: string): PaymentMethod | null {
  for (const { alias, method } of PAYMENT_ALIASES) {
    if (containsWord(text, alias)) return method;
  }
  return null;
}

/* ----------------------------------------------------------- descriptions */

const DATE_FILLERS = [
  "today",
  "yesterday",
  "tomorrow",
  "this morning",
  "this afternoon",
  "this evening",
  "this night",
  "last night",
];

function stripFillers(value: string): string {
  let result = value;
  for (const filler of DATE_FILLERS) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(filler)}\\b`, "gi"), " ");
  }
  result = result.replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, " ");
  return result.replace(/\s+/g, " ").trim();
}

function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractExpenseDescription(
  text: string,
  category: Category | null,
  amountMatched: string | null
): string {
  const onFor = text.match(/\b(?:on|for)\s+(.+)$/);
  if (onFor) {
    const candidate = stripFillers(onFor[1]);
    if (candidate && !/^[0-9.,₦\s]+$/.test(candidate)) {
      return titleCase(candidate);
    }
  }

  let remainder = text;
  if (amountMatched) {
    remainder = remainder.replace(amountMatched.toLowerCase(), " ");
  }
  remainder = remainder
    .replace(
      /\b(?:i\s+)?(?:spent|spend|paid|pay|bought|buy|purchased|purchase|expense|expenses|cost|costs|debited|withdrew)\b/gi,
      " "
    )
    .replace(/\b(?:on|for|at|the|a|an|my|some|of|naira)\b/gi, " ");
  remainder = stripFillers(remainder).replace(/\s+/g, " ").trim();

  if (remainder) return titleCase(remainder);
  if (category) return category.name;
  return "Voice entry";
}

function extractIncomePhrase(text: string): string {
  const from = text.match(/\bfrom\s+(.+)$/);
  if (from) {
    return titleCase(stripFillers(from[1]));
  }
  return "";
}

/* --------------------------------------------------------------- main parse */

export interface ParseVoiceOptions {
  categories: Category[];
  today?: string;
  now?: Date;
}

export function parseVoiceCommand(
  transcript: string,
  options: ParseVoiceOptions
): VoiceDraft {
  const { categories, today = getTodayString(), now = new Date() } = options;
  const text = normalizeTranscript(transcript);

  const { date, matched: dateMatches } = extractDate(text, today);
  const { time, matched: timeMatch } = extractTime(text, now);

  let amountText = text;
  for (const phrase of dateMatches) {
    amountText = amountText.split(phrase).join(" ");
  }
  if (timeMatch) {
    amountText = amountText.split(timeMatch).join(" ");
  }

  const amount = extractAmount(amountText);
  const type = detectType(text);

  const category = matchCategory(text, categories);
  const source = matchIncomeSource(text);
  const paymentMethod = matchPaymentMethod(text);
  const amountMatched = amountText.match(
    /(?:₦\s*)?\d[\d,]*(?:\.\d+)?\s*(?:k|thousand|million|m|billion|bn|hundred)?/i
  )?.[0] ?? null;

  let description = "";
  if (type === "expense") {
    description = extractExpenseDescription(text, category, amountMatched);
  } else if (type === "income") {
    description = extractIncomePhrase(text);
  }

  return {
    type,
    amountKobo: amount.kobo,
    description,
    // Category and source matches are kept even while the type is ambiguous so
    // a follow-up answer can reuse the recognised value.
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    source,
    paymentMethod,
    date,
    time,
    raw: transcript,
  };
}

/* ------------------------------------------------------------- follow-ups */

/** True once the draft can be written to the database without more input. */
export function isVoiceDraftReady(draft: VoiceDraft): boolean {
  if (!draft.type) return false;
  if (draft.amountKobo === null || draft.amountKobo <= 0) return false;
  if (draft.type === "expense") return draft.categoryId !== null;
  return draft.source !== null;
}

/**
 * Returns the next short question needed to complete the draft, or null when
 * it is ready to summarise and confirm.
 */
export function buildNextQuestion(
  draft: VoiceDraft,
  categories: Category[]
): VoiceQuestion | null {
  if (!draft.type) {
    return {
      field: "type",
      prompt: "Was this an expense or income?",
      kind: "choice",
      options: [
        { label: "Expense", value: "expense", detail: "Money you spent" },
        { label: "Income", value: "income", detail: "Money you received" },
      ],
    };
  }

  if (draft.amountKobo === null || draft.amountKobo <= 0) {
    return {
      field: "amount",
      prompt: "How much was it?",
      kind: "amount",
    };
  }

  if (draft.type === "expense" && draft.categoryId === null) {
    return {
      field: "category",
      prompt: "Which category should I use?",
      kind: "choice",
      options: categories.map((category) => ({
        label: category.name,
        value: String(category.id),
        detail: category.icon,
      })),
    };
  }

  if (draft.type === "income" && !draft.source) {
    return {
      field: "source",
      prompt: "Where did this income come from?",
      kind: "choice",
      options: INCOME_SOURCES.map((source) => ({
        label: source,
        value: source,
      })),
    };
  }

  return null;
}

/** Applies the user's answer to a follow-up question, returning a new draft. */
export function applyVoiceAnswer(
  draft: VoiceDraft,
  field: VoiceQuestionField,
  value: string,
  categories: Category[]
): VoiceDraft {
  switch (field) {
    case "type": {
      const type = value === "income" ? "income" : "expense";
      return {
        ...draft,
        type,
        categoryId: type === "expense" ? draft.categoryId : null,
        categoryName: type === "expense" ? draft.categoryName : null,
        source: type === "income" ? draft.source : null,
      };
    }
    case "amount": {
      const parsed = Number(value.replace(/[₦,\s]/g, ""));
      const kobo = Number.isFinite(parsed) && parsed > 0 ? nairaToKobo(parsed) : null;
      return { ...draft, amountKobo: kobo };
    }
    case "category": {
      const category =
        categories.find((item) => String(item.id) === value) ?? null;
      return {
        ...draft,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
      };
    }
    case "source": {
      return { ...draft, source: value as IncomeSource };
    }
    default:
      return draft;
  }
}

/* --------------------------------------------------------------- summary */

function formatDateForDisplay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Human-readable summary rows shown to the user before they confirm. The
 * amount is rendered through the shared kobo formatter so voice entries match
 * the rest of the app.
 */
export function summarizeVoiceDraft(draft: VoiceDraft): VoiceSummaryRow[] {
  const rows: VoiceSummaryRow[] = [
    {
      label: "Type",
      value: draft.type === "income" ? "Income" : "Expense",
    },
    {
      label: "Amount",
      value:
        draft.amountKobo !== null && draft.amountKobo > 0
          ? formatKoboAmount(draft.amountKobo)
          : "Not set",
    },
  ];

  if (draft.type === "income") {
    rows.push({ label: "Source", value: draft.source ?? "Not set" });
    if (draft.description) {
      rows.push({ label: "Details", value: draft.description });
    }
  } else {
    rows.push({ label: "Description", value: draft.description || "Not set" });
    rows.push({ label: "Category", value: draft.categoryName ?? "Not set" });
  }

  rows.push({ label: "Payment method", value: draft.paymentMethod ?? "Cash" });
  rows.push({ label: "Date", value: formatDateForDisplay(draft.date) });

  return rows;
}

/* ----------------------------------------------------------- fingerprint */

/**
 * Stable identity for a parsed transaction, used to stop the same command
 * being saved twice (double taps, re-confirming the same summary).
 */
export function voiceDraftFingerprint(draft: VoiceDraft): string {
  const detail = draft.type === "income" ? draft.source ?? "" : draft.categoryId ?? "";
  return [
    draft.type ?? "?",
    draft.amountKobo ?? 0,
    draft.date,
    draft.description.trim().toLowerCase(),
    detail,
  ].join("|");
}
