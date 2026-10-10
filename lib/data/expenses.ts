/**
 * The expense categories and every Dexie query the app makes. Components call these functions;
 * they never touch Dexie directly.
 */
import { database, newId, type Expense } from "@/lib/db";

export type Category = {
  id: string;
  label: string;
  /** One of the themed chart colours, resolved by the chart wrapper to `--color-<id>`. */
  color: string;
};

/** The five categories, in the order the form, list and chart present them. */
export const CATEGORIES: Category[] = [
  { id: "food", label: "Food", color: "var(--chart-1)" },
  { id: "transport", label: "Transport", color: "var(--chart-2)" },
  { id: "home", label: "Home", color: "var(--chart-3)" },
  { id: "fun", label: "Fun", color: "var(--chart-4)" },
  { id: "other", label: "Other", color: "var(--chart-5)" },
];

const CATEGORY_IDS = new Set(CATEGORIES.map((category) => category.id));

export function isCategory(value: string): value is Category["id"] {
  return CATEGORY_IDS.has(value);
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

const expenses = async () => (await database.ready()).expenses;

/**
 * Local calendar dates as "YYYY-MM-DD". Days are counted by the calendar, never by dividing
 * milliseconds, so daylight-saving shifts cannot move an expense into the wrong month.
 */
export function localDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Every expense dated inside the given local calendar month (monthIndex is 0-based). */
export async function listExpensesInMonth(year: number, monthIndex: number): Promise<Expense[]> {
  const start = `${year}-${`${monthIndex + 1}`.padStart(2, "0")}-01`;
  const endExclusive = monthIndex === 11 ? `${year + 1}-01-01` : `${year}-${`${monthIndex + 2}`.padStart(2, "0")}-01`;
  const rows = await (await expenses())
    .where("date")
    .between(start, endExclusive, true, false)
    .toArray();
  // Newest first within the month; the id breaks ties so the order is stable.
  return rows.sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : b.date.localeCompare(a.date)));
}

export type NewExpense = {
  /** Minor units (cents). */
  amountCents: number;
  category: Category["id"];
  date: string;
};

export async function addExpense({ amountCents, category, date }: NewExpense): Promise<string> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  if (!isCategory(category)) {
    throw new Error("Choose one of the categories.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Choose a date.");
  }
  const id = newId();
  await (await expenses()).add({ id, amountCents, category, date });
  return id;
}

export async function deleteExpense(id: string): Promise<void> {
  await (await expenses()).delete(id);
}
