/**
 * Get today's date as a YYYY-MM-DD string in local time.
 */
export function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get the Monday of the current week as YYYY-MM-DD.
 * Week runs Monday → Sunday.
 */
export function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dayStr = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

/**
 * Get the Sunday of the current week as YYYY-MM-DD.
 * Week runs Monday → Sunday.
 */
export function getWeekEnd(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days until the coming Sunday. Must be (7 - day) % 7, not 6 - day:
  // 6 - day counts days until Saturday, which silently dropped Sunday from
  // every Monday-Sunday total.
  const diff = (7 - day) % 7;
  const sunday = new Date(d);
  sunday.setDate(d.getDate() + diff);
  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const dayStr = String(sunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

/**
 * Get yesterday's date as YYYY-MM-DD string.
 */
export function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get the first day of the current month as YYYY-MM-DD.
 */
export function getMonthStart(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * Get the last day of the current month as YYYY-MM-DD.
 */
export function getMonthEnd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  const mStr = String(m).padStart(2, "0");
  const dayStr = String(lastDay).padStart(2, "0");
  return `${y}-${mStr}-${dayStr}`;
}

/**
 * Get Monday of the previous week as YYYY-MM-DD.
 * Week runs Monday -> Sunday.
 */
export function getLastWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(d);
  thisMonday.setDate(d.getDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const y = lastMonday.getFullYear();
  const m = String(lastMonday.getMonth() + 1).padStart(2, "0");
  const dayStr = String(lastMonday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

/**
 * Get Sunday of the previous week as YYYY-MM-DD.
 * Week runs Monday -> Sunday.
 */
export function getLastWeekEnd(): string {
  const d = new Date();
  const day = d.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(d);
  thisMonday.setDate(d.getDate() - daysSinceMonday);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  const y = lastSunday.getFullYear();
  const m = String(lastSunday.getMonth() + 1).padStart(2, "0");
  const dayStr = String(lastSunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

/**
 * Check if a date string (YYYY-MM-DD...) is today.
 */
export function isToday(dateStr: string): boolean {
  return dateStr.startsWith(getTodayString());
}

/**
 * Check if a date string (YYYY-MM-DD...) is yesterday.
 */
export function isYesterday(dateStr: string): boolean {
  return dateStr.startsWith(getYesterdayString());
}

/**
 * Format a full datetime string for display in details.
 * "2026-09-17 14:30:00" -> "Thu, 17 Sep 2026 at 2:30 PM"
 */
export function formatFullDateTime(datetimeStr: string): string {
  const d = new Date(datetimeStr.replace(" ", "T"));
  return d.toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + " at " + d.toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a date string for display in history section headers.
 * "2026-09-17" -> "Thu, 17 Sep 2026"
 */
export function formatHistoryDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Get Monday of the week containing the given YYYY-MM-DD string.
 */
export function getWeekStartForDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dayStr = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

/**
 * Get Sunday of the week containing the given YYYY-MM-DD string.
 */
export function getWeekEndForDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = (7 - day) % 7;
  const sunday = new Date(d);
  sunday.setDate(d.getDate() + diff);
  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const dayStr = String(sunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

/**
 * Shift a YYYY-MM-DD date by N weeks.
 */
export function shiftWeek(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + weeks * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

/**
 * Format a week range for display.
 * "2026-09-15", "2026-09-21" -> "15 Sep - 21 Sep 2026"
 */
export function formatWeekRange(monday: string, sunday: string): string {
  const m = new Date(monday + "T00:00:00");
  const s = new Date(sunday + "T00:00:00");
  const mMonth = m.toLocaleDateString("en-NG", { month: "short" });
  const sMonth = s.toLocaleDateString("en-NG", { month: "short" });
  return `${m.getDate()} ${mMonth} - ${s.getDate()} ${sMonth} ${s.getFullYear()}`;
}

/**
 * Get short day name from a YYYY-MM-DD date string.
 * "2026-09-15" -> "Mon"
 */
export function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-NG", { weekday: "short" });
}

/**
 * Format a short date for daily labels.
 * "2026-09-15" -> "15 Sep"
 */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

/**
 * Get all 7 date strings (Mon-Sun) for a week starting at the given Monday.
 */
export function getWeekDays(mondayDateStr: string): string[] {
  const days: string[] = [];
  const d = new Date(mondayDateStr + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const dayStr = String(day.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${dayStr}`);
  }
  return days;
}

/**
 * Get a greeting based on the current hour.
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
