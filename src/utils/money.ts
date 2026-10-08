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
 * Group an integer amount with thousands separators, independent of the
 * device's Intl support. 2000 → "2,000"; -1000.5 with 2 digits → "-1,000.50".
 */
export function groupNaira(naira: number, fractionDigits: number): string {
  const [int, dec] = Math.abs(naira).toFixed(fractionDigits).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = naira < 0 ? "-" : "";
  return dec ? `${sign}${grouped}.${dec}` : `${sign}${grouped}`;
}

/**
 * Format a kobo amount as a display string with ₦ and commas.
 * 250000 → "₦2,500"
 * 7550 → "₦75.5"
 */
export function formatKoboAmount(kobo: number): string {
  let num = groupNaira(koboToNaira(kobo), 2);
  if (num.includes(".")) {
    num = num.replace(/0+$/, "").replace(/\.$/, "");
  }
  return `₦${num}`;
}

/**
 * Format a raw amount field as the user types, grouping thousands with
 * commas and keeping at most two decimal places.
 * "20000" → "20,000", "2000" → "2,000", "2000.5" → "2,000.5"
 */
export function formatAmountInput(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const rawInt = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const int = rawInt.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (dot === -1) return int;
  const dec = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${int}.${dec}`;
}

/**
 * Format a kobo amount with an explicit + or - sign, for period-over-period
 * comparisons. formatKoboAmount(-50000) would render "₦-500", so the sign is
 * pulled out in front of the currency symbol instead.
 * 50000 → "+₦500", -50000 → "-₦500", 0 → "₦0"
 */
export function formatSignedKoboAmount(kobo: number): string {
  if (kobo === 0) return formatKoboAmount(0);
  const sign = kobo > 0 ? "+" : "-";
  return `${sign}${formatKoboAmount(Math.abs(kobo))}`;
}
