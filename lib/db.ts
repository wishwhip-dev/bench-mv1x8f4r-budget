/**
 * This application's database.
 *
 * The reusable half of the setup is in `lib/storage/` and is not edited. This file is the half
 * that describes the product: which tables exist, what is indexed, how the schema has changed over
 * time, and what a first visit starts with. It also wraps the shared handle with what the product
 * needs around the durable open, because the shared package swallows a failed one and silently
 * lands in the in-memory fallback, where nothing survives a reload. Nothing is reported as
 * "saved in this browser" here unless the browser's own IndexedDB really holds the database.
 */
import { type Transaction } from "dexie";
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

/** One row of the small key-value store for bookkeeping, such as the storage-proof marker. */
export type StorageMetaRow = {
  key: string;
  /** Free-form payload for the row's key; the proof marker stores a per-session counter. */
  session: number;
};

type Tables = { expenses: Expense; meta: StorageMetaRow };

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

const inner = defineDatabase<Tables>({
  name: "monthly-spending",
  versions: [
    // Only the primary key and the properties queried on: the list and totals filter by `date`.
    { version: 1, stores: { expenses: "id, date" } },
    { version: 2, stores: { expenses: "id, date" }, upgrade: upgradeTo2 },
    // The proof marker lets a later visit check that rows written earlier really survived.
    { version: 3, stores: { meta: "key" } },
  ],
});

/** How the durable open went, once `ready()` has resolved. Undefined before that. */
export type OpenOutcome = "opened" | "retried" | "repaired" | "refused";
let openOutcome: OpenOutcome | undefined;

/**
 * Asks the browser's own IndexedDB whether it really holds this database — an independent
 * check on the shared package's word. Resolves `false` only when the browser answered and the
 * database is not there; `undefined` when the browser cannot be asked (API missing, timed out,
 * errored), in which case the shared open's answer stands.
 */
async function realStoreHasDatabase(): Promise<boolean | undefined> {
  try {
    const factory = globalThis.indexedDB;
    if (!factory || typeof factory.databases !== "function") return undefined;
    const listed = await Promise.race([
      factory.databases(),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1000)),
    ]);
    if (!listed) return undefined;
    return listed.some((entry) => entry.name === inner.name);
  } catch (error) {
    console.warn("[db] Could not ask the browser's IndexedDB what it holds.", error);
    return undefined;
  }
}

/**
 * Asks the browser to not evict the database under storage pressure. Chrome and Safari keep
 * best-effort storage on a eviction list until this is granted; Dexie's own guide recommends it
 * for anything meant to keep data. Refusal changes nothing the visitor can act on, so the
 * answer is only logged.
 */
async function requestPersistence(): Promise<void> {
  try {
    const granted = await globalThis.navigator?.storage?.persist?.();
    if (granted === false) {
      console.warn("[db] The browser declined to make storage persistent; it may evict the database under pressure.");
    }
  } catch (error) {
    console.warn("[db] The storage persistence request failed.", error);
  }
}

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
 * there everything the visitor adds is gone on reload. So the wrapper recovers before accepting
 * the fallback: a plain reopen for a transient error, then deleting the stored database that
 * cannot be opened and starting fresh. A "durable" answer is also confirmed against the
 * browser's own IndexedDB before the page is allowed to claim it. Each outcome is recorded and
 * said on screen.
 */
async function readyWithRetry(): Promise<AppDatabase<Tables>> {
  openOutcome = undefined;
  const first = await inner.ready();

  /** Accepts the current durable open if the browser's own store confirms it. */
  const acceptDurable = async (outcome: OpenOutcome): Promise<boolean> => {
    if ((await realStoreHasDatabase()) === false) {
      console.warn(
        `[db] The open reported durable storage, but the browser's IndexedDB does not list "${inner.name}".`,
      );
      await inner.close();
      return false;
    }
    openOutcome = outcome;
    void requestPersistence();
    return true;
  };

  if (!isStorageAvailable()) {
    // No IndexedDB API at all. The memory fallback is the honest answer and the page says so.
    openOutcome = "refused";
    return first;
  }

  if (inner.mode() === "durable" && (await acceptDurable("opened"))) {
    return inner.current() ?? first;
  }

  if (inner.mode() !== "durable") {
    console.warn("[db] The browser has IndexedDB but the durable open failed; retrying.");
  }

  // Recovery step 1: a plain reopen — a transient failure looks exactly like a swallowed one.
  try {
    await inner.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await inner.ready();
    if (inner.mode() === "durable" && (await acceptDurable("retried"))) {
      return inner.current() ?? first;
    }
  } catch (error) {
    console.warn("[db] The retry open also failed.", error);
  }

  // Recovery step 2: the stored database cannot be opened (or is not the one that was opened).
  // Deleting it loses whatever it held, but that data was unreadable anyway, and a fresh
  // database keeps everything the visitor adds from here on.
  try {
    await inner.close();
    const deleted = await deleteStoredDatabase();
    if (deleted) {
      console.warn(
        `[db] The "${inner.name}" database could not be opened; it was recreated. Its unreadable contents are gone.`,
      );
      await inner.ready();
      if (inner.mode() === "durable" && (await acceptDurable("repaired"))) {
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
