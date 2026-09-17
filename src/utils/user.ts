import { SQLiteDatabase } from "expo-sqlite";

const USER_NAME_KEY = "user_name";
const USER_PHONE_KEY = "user_phone";
const USER_EMAIL_KEY = "user_email";
const ONBOARDING_COMPLETE_KEY = "onboarding_complete";

export async function getUserName(db: SQLiteDatabase): Promise<string | null> {
  const result = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    USER_NAME_KEY
  );
  return result?.value ?? null;
}

export async function saveUserProfile(
  db: SQLiteDatabase,
  name: string,
  phone: string,
  email: string
): Promise<void> {
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    USER_NAME_KEY,
    name.trim()
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    USER_PHONE_KEY,
    phone.trim()
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    USER_EMAIL_KEY,
    email.trim()
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    ONBOARDING_COMPLETE_KEY,
    "true"
  );
}

export async function isOnboardingComplete(
  db: SQLiteDatabase
): Promise<boolean> {
  const result = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    ONBOARDING_COMPLETE_KEY
  );
  return result?.value === "true";
}
