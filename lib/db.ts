/**
 * This application's database.
 *
 * The reusable half of the setup is in `lib/storage/` and is not edited. This file is the half
 * that describes the product: which tables exist, what is indexed, how the schema has changed over
 * time, and what a first visit starts with.
 */
import { defineDatabase } from "@/lib/storage/database";

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

export const database = defineDatabase<{ expenses: Expense }>({
  name: "monthly-spending",
  versions: [
    // Only the primary key and the properties queried on: the list and totals filter by `date`.
    { version: 1, stores: { expenses: "id, date" } },
  ],
});
