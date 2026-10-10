"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteExpense, CATEGORIES, type Expense } from "@/lib/data/expenses";
import { formatDateISO, formatMoney } from "@/lib/format";

/**
 * The month's expense list, newest first, one row per expense with its amount, category and date
 * and a destructive Delete button. Rows render straight from the data module's category list.
 */
export function ExpenseList({ expenses }: { expenses: Expense[] }) {
  async function handleDelete(expense: Expense) {
    try {
      await deleteExpense(expense.id);
      const label = CATEGORIES.find((category) => category.id === expense.category)?.label ?? expense.category;
      toast.success(`Deleted the ${label} expense of ${formatMoney(expense.amountCents)}`);
    } catch (cause) {
      toast.error(`Could not delete the expense: ${cause instanceof Error ? cause.message : "unknown error"}`);
    }
  }

  return (
    <ul className="divide-y" aria-label="Expenses this month">
      {expenses.map((expense) => (
        <li key={expense.id} className="flex items-center gap-3 py-3">
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-full ${categoryDot(expense.category)}`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{categoryLabel(expense.category)}</p>
            <p className="text-sm text-muted-foreground">{formatDateISO(expense.date)}</p>
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(expense.amountCents)}</p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handleDelete(expense)}
            aria-label={`Delete the ${categoryLabel(expense.category)} expense of ${formatMoney(expense.amountCents)}`}
          >
            Delete
          </Button>
        </li>
      ))}
    </ul>
  );
}

function categoryLabel(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

/** Tailwind background classes mirroring the themed chart colours, for the list's colour dots. */
const DOT_CLASSES: Record<string, string> = {
  "var(--chart-1)": "bg-chart-1",
  "var(--chart-2)": "bg-chart-2",
  "var(--chart-3)": "bg-chart-3",
  "var(--chart-4)": "bg-chart-4",
  "var(--chart-5)": "bg-chart-5",
};

function categoryDot(id: string): string {
  const color = CATEGORIES.find((category) => category.id === id)?.color ?? "";
  return DOT_CLASSES[color] ?? "bg-muted-foreground";
}