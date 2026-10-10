/**
 * This application's database.
 *
 * The reusable half of the setup is in `lib/storage/` and is not edited. This file is the half
 * that describes the product: which tables exist, what is indexed, how the schema has changed over
 * time, and what a first visit starts with. It also wraps the shared handle with what the product
 * needs around a failed durable open, because the shared package swallows that error and silently
 * lands in the in-memory fallback, where nothing survives a reload.
 */
import Dexie, { type Transaction } from "dexie";
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

/**
 * Version 2 exists to reconcile a database an earlier build of this app may have created under a
 * different shape at version 1. Re-declaring the same stores makes Dexie run its 1→2 upgrade and
 * rebuild `expenses` to exactly this declaration, carrying the rows across, and the upgrade then
 * normalises row shapes an earlier build might have written. A fresh browser creates the database
 * straight at version 2 and runs none of this.
 */
const MIGRATION_CATEGORY_IDS = ["food", "transport", "home", "fun", "other"];

function upgradeTo2(transaction: Transaction): Promise<unknown> {
  return transaction
    .table("expenses")
    .toCollection()
    .modify((expense: Record<string, unknown>) => {
      if (typeof expense.amountCents !== "number" || !Number.isFinite(expense.amountCents)) {
        const raw = typeof expense.amount === "string" ? Number.parseFloat(expense.amount) : expense.amount;
        expense.amountCents =
          typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw * 100) : 0;
      }
      if (typeof expense.category !== "string" || !MIGRATION_CATEGORY_IDS.includes(expense.category)) {
        expense.category = "other";
      }
      delete expense.amount;
    });
}

const inner = defineDatabase<{ expenses: Expense }>({
  name: "monthly-spending",
  versions: [
    // Only the primary key and the properties queried on: the list and totals filter by `date`.
    { version: 1, stores: { expenses: "id, date" } },
    { version: 2, stores: { expenses: "id, date" }, upgrade: upgradeTo2 },
  ],
});

/** How the durable open went, once `ready()` has resolved. Undefined before that. */
export type OpenOutcome = "opened" | "retried" | "repaired" | "refused";
let openOutcome: OpenOutcome | undefined;

/**
 * Deletes the browser's copy of this database. Resolves false instead of throwing, and gives up
 * after two seconds rather than hanging the app on a delete another connection holds open.
 */
function deleteStoredDatabase(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const request = globalThis.indexedDB?.deleteDatabase(inner.name);
      if (!request) return done(false);
      request.onsuccess = () => done(true);
      request.onerror = () => done(false);
      request.onblocked = () => done(false);
      setTimeout(() => done(false), 2000);
    } catch {
      done(false);
    }
  });
}

/**
 * The shared package falls back to an in-memory database after a single failed `open()` — the
 * right answer for a browser that refuses IndexedDB, but that same silent fallback is also what
 * an unopenable stored database looks like (an earlier schema at the same version, say), and
 * there everything the visitor adds is gone on reload. So when the browser itself claims to have
 * IndexedDB, recover before accepting the fallback: first a plain reopen, for a transient error;
 * then, if the durable open still will not go through, deleting the stored database that cannot
 * be opened and starting fresh. Each outcome is recorded and said on screen.
 */
async function readyWithRetry(): Promise<AppDatabase<{ expenses: Expense }>> {
  openOutcome = undefined;
  const first = await inner.ready();
  if (inner.mode() === "durable" || !isStorageAvailable()) {
    openOutcome = "opened";
    return inner.current() ?? first;
  }

  console.warn("[db] The browser has IndexedDB but the durable open failed; retrying.");

  try {
    await inner.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await inner.ready();
    if (inner.mode() === "durable") {
      openOutcome = "retried";
      return inner.current() ?? first;
    }
  } catch (error) {
    console.warn("[db] The retry open also failed.", error);
  }

  try {
    await inner.close();
    const deleted = await deleteStoredDatabase();
    if (deleted) {
      console.warn(
        `[db] The "${inner.name}" database could not be opened; it was recreated. Its unreadable contents are gone.`,
      );
      await inner.ready();
      if (inner.mode() === "durable") {
        openOutcome = "repaired";
        return inner.current() ?? first;
      }
    }
  } catch (error) {
    console.warn("[db] The repair open also failed.", error);
  }

  openOutcome = "refused";
  return first;
}

let opening: Promise<AppDatabase<{ expenses: Expense }>> | undefined;

export const database: DatabaseHandle<{ expenses: Expense }> & {
  openOutcome: () => OpenOutcome | undefined;
} = {
  name: inner.name,
  schemaVersion: inner.schemaVersion,
  tableNames: inner.tableNames,
  ready: () => {
    opening ??= readyWithRetry();
    return opening;
  },
  current: () => inner.current(),
  mode: () => inner.mode(),
  openOutcome: () => openOutcome,
  isAvailable: inner.isAvailable,
  seedResult: () => inner.seedResult(),
  close: async () => {
    await inner.close();
    openOutcome = undefined;
    opening = undefined;
  },
  reset: async () => {
    await inner.reset();
    openOutcome = undefined;
    opening = undefined;
  },
};
