/**
 * Convert a naira amount to kobo (integer).
 * ₦2,500 → 250000
 * ₦75.50 → 7550
 */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * Convert kobo (integer) to naira (float).
 * 250000 → ₦2,500
 * 7550 → ₦75.50
 */
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

/**
 * Parse a user-entered naira string into a number.
 * Handles commas, whitespace, and the ₦ symbol.
 * Returns NaN if the input is not a valid number.
 */
export function parseNairaInput(text: string): number {
  const cleaned = text.replace(/[₦\s,]/g, "");
  if (cleaned === "") return NaN;
  const num = parseFloat(cleaned);
  return num;
}

/**
 * Parse a user-entered naira string, rejecting anything not fully numeric.
 * Accepts plain decimals plus the ₦ symbol, thousands separators and
 * surrounding whitespace. parseFloat alone would read "12abc34" as 12 and
 * silently save the wrong amount, so the whole string must match.
 */
export function parseNairaAmount(text: string): number {
  const cleaned = text.replace(/[₦\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return parseFloat(cleaned);
}

/**
 * Format a kobo amount as a display string with ₦ and commas.
 * 250000 → "₦2,500"
 * 7550 → "₦75.50"
 */
export function formatKoboAmount(kobo: number): string {
  const naira = koboToNaira(kobo);
  return `₦${naira.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
