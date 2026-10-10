/**
 * This application's database.
 *
 * The reusable half of the setup is in `lib/storage/` and is not edited. This file is the half
 * that describes the product: which tables exist, what is indexed, how the schema has changed over
 * time, and what a first visit starts with. It also wraps the shared handle with one behaviour the
 * product needs: retrying the durable open before accepting the in-memory fallback.
 */
import {
  defineDatabase,
  isStorageAvailable,
  type AppDatabase,
  type DatabaseHandle,
} from "@/lib/storage/database";

/** One expense. `date` is a local calendar date as "YYYY-MM-DD", indexed because months filter on it. */
export type Expense = {
  id: string;
  /** Minor units (cents), so 12.50 is stored as 1250 and never suffers float drift. */
  amountCents: number;
  /** One of the ids in `CATEGORIES` from `lib/data/expenses.ts`. */
  category: string;
  /** "YYYY-MM-DD" in the person's local calendar. */
  date: string;
};

/** Ids are generated here so the data layer never depends on an auto-increment round trip. */
export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const inner = defineDatabase<{ expenses: Expense }>({
  name: "monthly-spending",
  versions: [
    // Only the primary key and the properties queried on: the list and totals filter by `date`.
    { version: 1, stores: { expenses: "id, date" } },
  ],
});

/**
 * The shared package falls back to an in-memory database after a single failed `open()` — the
 * right answer for a browser that refuses IndexedDB, but one failed attempt is also what a
 * transient error looks like, and the fallback is silent: everything the visitor adds works for
 * the session and is gone on reload. So when the browser itself claims to have IndexedDB, retry
 * the durable open before accepting the fallback. A genuinely refusing browser still lands in
 * memory, a beat later, and the app says so on screen.
 */
async function readyWithRetry(): Promise<AppDatabase<{ expenses: Expense }>> {
  const db = await inner.ready();
  if (inner.mode() === "memory" && isStorageAvailable()) {
    await inner.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await inner.ready();
  }
  return inner.current() ?? db;
}

let opening: Promise<AppDatabase<{ expenses: Expense }>> | undefined;

export const database: DatabaseHandle<{ expenses: Expense }> = {
  name: inner.name,
  schemaVersion: inner.schemaVersion,
  tableNames: inner.tableNames,
  ready: () => {
    opening ??= readyWithRetry();
    return opening;
  },
  current: () => inner.current(),
  mode: () => inner.mode(),
  isAvailable: inner.isAvailable,
  seedResult: () => inner.seedResult(),
  close: async () => {
    await inner.close();
    opening = undefined;
  },
  reset: async () => {
    await inner.reset();
    opening = undefined;
  },
};
