/**
 * Locale helpers for speech recognition. Kept pure (no native imports) so they
 * can be tested in Node.
 */

/** English locales the app prefers, in order, when they are supported. */
export const PREFERRED_LOCALES = ["en-US", "en-GB", "en-NG"];

/**
 * Picks the best locale to hand to the speech recogniser.
 *
 * Preference order:
 * 1. The first preferred locale the device supports (case-insensitive).
 * 2. The first supported English locale.
 * 3. The first supported locale of any kind.
 * 4. The first preferred locale (default `en-US`) when nothing is reported.
 *
 * Android returns an empty list below API 31 and when the query fails, so the
 * fallback keeps recognition working with the engine's own default.
 */
export function pickPreferredLocale(
  supported: string[],
  preferred: string[] = PREFERRED_LOCALES,
): string {
  const available = supported.filter((locale) => locale.trim().length > 0);
  const normalized = new Set(available.map((locale) => locale.toLowerCase()));

  for (const locale of preferred) {
    if (normalized.has(locale.toLowerCase())) return locale;
  }

  const english = available.find((locale) =>
    locale.toLowerCase().startsWith("en"),
  );
  if (english) return english;

  if (available.length > 0) return available[0];

  return preferred[0] ?? "en-US";
}
