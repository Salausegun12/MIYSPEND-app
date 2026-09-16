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
  const diff = day === 0 ? 0 : 6 - day; // days until Sunday
  const sunday = new Date(d);
  sunday.setDate(d.getDate() + diff);
  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const dayStr = String(sunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
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
