export type ReportPeriodId =
  | "current-week"
  | "last-week"
  | "last-2-weeks"
  | "last-month"
  | "last-3-months"
  | "last-6-months"
  | "last-year";

export type ReportAvailability = "available" | "partial" | "unavailable";

export interface ReportPeriod {
  id: ReportPeriodId;
  label: string;
  chipLabel: string;
  startDate: string;
  endDate: string;
  dataThroughDate: string;
  startDateTime: string;
  dataEndDateTime: string;
  rangeLabel: string;
  isCurrentWeek: boolean;
}

export interface ReportAvailabilitySummary {
  availability: ReportAvailability;
  message: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateTimeString(date: Date): string {
  return `${toDateString(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(date, -daysSinceMonday);
}

function parseDateString(dateString: string): Date {
  return new Date(`${dateString}T00:00:00`);
}

export function formatReportDate(dateString: string): string {
  const date = parseDateString(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatReportDateTime(dateTimeString: string): string {
  const date = new Date(dateTimeString.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return dateTimeString;

  return `${date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} at ${date.toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
}

function formatRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString("en-NG", { month: "short" });
  const endMonth = end.toLocaleDateString("en-NG", { month: "short" });
  const startText = `${start.getDate()} ${startMonth}`;
  const endText = `${end.getDate()} ${endMonth}`;

  if (start.getFullYear() === end.getFullYear()) {
    return `${startText} - ${endText} ${end.getFullYear()}`;
  }

  return `${startText} ${start.getFullYear()} - ${endText} ${end.getFullYear()}`;
}

function createPeriod(
  id: ReportPeriodId,
  label: string,
  chipLabel: string,
  start: Date,
  end: Date,
  dataThrough: Date,
  isCurrentWeek = false
): ReportPeriod {
  const startDate = toDateString(start);
  const endDate = toDateString(end);
  const dataThroughDate = toDateString(dataThrough);

  return {
    id,
    label,
    chipLabel,
    startDate,
    endDate,
    dataThroughDate,
    startDateTime: `${startDate} 00:00:00`,
    dataEndDateTime: isCurrentWeek
      ? toDateTimeString(dataThrough)
      : `${endDate} 23:59:59`,
    rangeLabel: formatRange(start, end),
    isCurrentWeek,
  };
}

export function getReportPeriods(referenceDate = new Date()): ReportPeriod[] {
  const currentDateTime = new Date(referenceDate);
  const today = new Date(
    currentDateTime.getFullYear(),
    currentDateTime.getMonth(),
    currentDateTime.getDate()
  );
  const currentWeekStart = startOfWeek(today);
  const currentWeekEnd = addDays(currentWeekStart, 6);
  const previousWeekStart = addDays(currentWeekStart, -7);
  const previousWeekEnd = addDays(currentWeekStart, -1);
  const twoWeeksStart = addDays(currentWeekStart, -14);
  const year = today.getFullYear();
  const month = today.getMonth();
  const previousMonthStart = new Date(year, month - 1, 1);
  const previousMonthEnd = new Date(year, month, 0);
  const threeMonthsStart = new Date(year, month - 3, 1);
  const threeMonthsEnd = new Date(year, month - 1, 0);
  const sixMonthsStart = new Date(year, month - 6, 1);
  const sixMonthsEnd = new Date(year, month - 1, 0);
  const previousYearStart = new Date(year - 1, 0, 1);
  const previousYearEnd = new Date(year - 1, 11, 31);

  return [
    createPeriod(
      "current-week",
      "This week",
      "This week",
      currentWeekStart,
      currentWeekEnd,
      currentDateTime,
      true
    ),
    createPeriod(
      "last-week",
      "Last week",
      "Last week",
      previousWeekStart,
      previousWeekEnd,
      previousWeekEnd
    ),
    createPeriod(
      "last-2-weeks",
      "Last 2 weeks",
      "2 weeks",
      twoWeeksStart,
      previousWeekEnd,
      previousWeekEnd
    ),
    createPeriod(
      "last-month",
      "Last month",
      "Last month",
      previousMonthStart,
      previousMonthEnd,
      previousMonthEnd
    ),
    createPeriod(
      "last-3-months",
      "Last 3 months",
      "3 months",
      threeMonthsStart,
      threeMonthsEnd,
      threeMonthsEnd
    ),
    createPeriod(
      "last-6-months",
      "Last 6 months",
      "6 months",
      sixMonthsStart,
      sixMonthsEnd,
      sixMonthsEnd
    ),
    createPeriod(
      "last-year",
      "Last year",
      "Last year",
      previousYearStart,
      previousYearEnd,
      previousYearEnd
    ),
  ];
}

export function getReportAvailability(
  period: ReportPeriod,
  oldestExpenseDate: string | null,
  expenseCount: number
): ReportAvailabilitySummary {
  if (!oldestExpenseDate) {
    return {
      availability: "unavailable",
      message: "Not available: no spending has been recorded yet.",
    };
  }

  if (oldestExpenseDate > period.dataThroughDate) {
    return {
      availability: "unavailable",
      message: `Not available: your recorded spending starts on ${formatReportDate(
        oldestExpenseDate
      )}, after this period.`,
    };
  }

  if (oldestExpenseDate > period.startDate) {
    if (expenseCount === 0) {
      return {
        availability: "unavailable",
        message: `Not available: no spending was recorded during this period. Recorded data starts on ${formatReportDate(
          oldestExpenseDate
        )}.`,
      };
    }

    return {
      availability: "partial",
      message: `Partial report: recorded data starts on ${formatReportDate(
        oldestExpenseDate
      )}. Only available transactions will be included.`,
    };
  }

  if (expenseCount === 0) {
    return {
      availability: "available",
      message: "Available: no spending was recorded during this period.",
    };
  }

  return {
    availability: "available",
    message: `Available: ${expenseCount} transaction${
      expenseCount === 1 ? "" : "s"
    } ready to download.`,
  };
}
