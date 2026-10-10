"use client";

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CATEGORIES, type Expense } from "@/lib/data/expenses";
import { formatMoney } from "@/lib/format";

/** The chart config is built from the data module's categories, never hard-coded here. */
const config = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, { label: category.label, color: category.color }]),
) satisfies ChartConfig;

export type CategoryTotal = { category: string; label: string; total: number };

/** Sum the month's expenses into one row per category that actually has spending. */
export function totalsByCategory(expenses: Expense[]): CategoryTotal[] {
  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountCents);
  }
  return CATEGORIES.filter((category) => byCategory.has(category.id)).map((category) => ({
    category: category.id,
    label: category.label,
    total: byCategory.get(category.id) ?? 0,
  }));
}

/**
 * This month's spending split by category, drawn with the shipped Recharts wrapper. Animation is
 * off on the series (the headless check never finishes it) and a readable breakdown sits under
 * the chart so the numbers do not hide behind the tooltip.
 */
export function CategoryChart({ expenses }: { expenses: Expense[] }) {
  const data = totalsByCategory(expenses);

  return (
    <div className="grid gap-4">
      <ChartContainer config={config} className="h-[220px] w-full">
        <BarChart data={data} margin={{ top: 8, bottom: 0, left: 8, right: 8 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            fontSize={11}
          />
          <YAxis tickFormatter={(value: number) => (value >= 1000 ? `${value / 1000}k` : `${value}`)} fontSize={11} width={40} tickLine={false} axisLine={false} />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value) * 100)} />}
          />
          <Bar dataKey="total" radius={4} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.category} fill={`var(--color-${entry.category})`} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <ul className="grid gap-1.5" aria-label="Spending by category">
        {data.map((entry) => (
          <li key={entry.category} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: CATEGORIES.find((c) => c.id === entry.category)?.color }}
            />
            <span className="flex-1">{entry.label}</span>
            <span className="tabular-nums font-medium">{formatMoney(entry.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}