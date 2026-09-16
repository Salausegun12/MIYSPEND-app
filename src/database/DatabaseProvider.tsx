import { SQLiteProvider, type SQLiteDatabase } from "expo-sqlite";
import { initializeDatabase } from "./migrations";

const DATABASE_NAME = "miyspend.db";

async function onInitDatabase(db: SQLiteDatabase): Promise<void> {
  await initializeDatabase(db);
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={onInitDatabase}>
      {children}
    </SQLiteProvider>
  );
}
