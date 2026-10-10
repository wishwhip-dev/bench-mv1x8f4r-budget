"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { identity } from "@/app/identity";
import { AddExpenseForm } from "@/components/add-expense-form";
import { CategoryChart } from "@/components/category-chart";
import { ExpenseList } from "@/components/expense-list";
import { database } from "@/lib/db";
import { latestExpense, listExpensesInMonth, monthOfDate } from "@/lib/data/expenses";
import { formatMoney, formatMonth, formatMonthName } from "@/lib/format";
import { useIsHydrated, useStorageStatus, useStoredQuery } from "@/lib/storage/react";

/**
 * The whole tracker: month navigation, the total, the add form, the category chart and the
 * expense list, all driven by one live query per selected month. The month and the data are
 * browser facts, so nothing month-dependent renders until hydration.
 */
export function Tracker() {
  const hydrated = useIsHydrated();
  const status = useStorageStatus(database);
  const [offset, setOffset] = useState(0);
  const [formOpen, setFormOpen] = useState(true);
  // The date of the expense just added, kept so an expense saved outside the month on screen can
  // point the visitor at the month it actually went to.
  const [justSavedDate, setJustSavedDate] = useState<string | null>(null);

  const { year, month } = useMemo(() => {
    if (!hydrated) return { year: 0, month: 0 };
    const now = new Date();
    const selected = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { year: selected.getFullYear(), month: selected.getMonth() };
  }, [hydrated, offset]);

  const { data: expenses, isLoading } = useStoredQuery(
    database,
    () => listExpensesInMonth(year, month),
    [year, month],
  );

  // The newest expense anywhere in the database. An empty month is not the same as an empty
  // tracker, and the list says so when the history starts (or continues) elsewhere.
  const { data: latest } = useStoredQuery(database, () => latestExpense(), []);

  const rows = expenses ?? [];
  const totalCents = rows.reduce((sum, expense) => sum + expense.amountCents, 0);

  function goToMonth(date: string) {
    const target = monthOfDate(date);
    setJustSavedDate(null);
    setOffset((current) => current + (target.year - year) * 12 + (target.monthIndex - month));
  }

  function moveMonth(step: number) {
    setJustSavedDate(null);
    setOffset((current) => current + step);
  }

  const savedElsewhere =
    justSavedDate !== null && (monthOfDate(justSavedDate).year !== year || monthOfDate(justSavedDate).monthIndex !== month);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{identity.name}</h1>
        <p className="text-sm text-muted-foreground">{identity.description}</p>
      </header>

      {status === "memory" && (
        <Alert>
          <AlertTitle>This browser will not keep your data</AlertTitle>
          <AlertDescription>
            IndexedDB is unavailable here, so the tracker is running in memory. Everything you add
            is lost when this tab closes.
          </AlertDescription>
        </Alert>
      )}

      {status === "durable" && database.openOutcome() === "repaired" && (
        <Alert variant="destructive">
          <AlertTitle>Your saved database was repaired</AlertTitle>
          <AlertDescription>
            The saved database could not be opened as it was, so it has been recreated. Earlier
            entries could not be recovered; everything you add from now on is kept.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            {hydrated ? (
              <p aria-live="polite" className="text-center text-base font-semibold">
                {formatMonth(year, month)}
              </p>
            ) : (
              <Skeleton className="h-6 w-36" aria-label="Selected month" />
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              disabled={offset >= 0}
              onClick={() => moveMonth(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            Spent in {hydrated ? formatMonthName(month) : "the month"}
          </p>
          {hydrated && !isLoading ? (
            <p className="text-5xl font-bold tabular-nums tracking-tight" aria-live="polite">
              {formatMoney(totalCents)}
            </p>
          ) : (
            <Skeleton className="h-12 w-40" aria-label="Month total" />
          )}
          <p className="text-xs text-muted-foreground">
            {hydrated && !isLoading
              ? `${rows.length} ${rows.length === 1 ? "expense" : "expenses"} this month`
              : "\u00a0"}
          </p>
        </CardContent>
      </Card>

      {savedElsewhere && (
        <MonthJump
          lead="Saved to"
          date={justSavedDate}
          onGo={() => goToMonth(justSavedDate)}
          onDismiss={() => setJustSavedDate(null)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add expense</CardTitle>
        </CardHeader>
        <CardContent>
          {formOpen ? (
            <AddExpenseForm onSaved={(date) => { setFormOpen(false); setJustSavedDate(date); }} />
          ) : (
            <Button className="w-full" onClick={() => setFormOpen(true)}>
              Add expense
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By category</CardTitle>
        </CardHeader>
        <CardContent>
          {hydrated && !isLoading ? (
            rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No spending recorded in {formatMonthName(month)} {year}.
              </p>
            ) : (
              <CategoryChart expenses={rows} />
            )
          ) : (
            <Skeleton className="h-[220px] w-full" aria-label="Spending chart" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {hydrated && !isLoading ? (
            rows.length === 0 ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  Nothing recorded yet. Add your first expense for {formatMonthName(month)} above.
                </p>
                {latest && (monthOfDate(latest.date).year !== year || monthOfDate(latest.date).monthIndex !== month) && (
                  <MonthJump lead="Your latest expense is in" date={latest.date} onGo={() => goToMonth(latest.date)} />
                )}
              </div>
            ) : (
              <ExpenseList expenses={rows} />
            )
          ) : (
            <div className="grid gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
        </CardContent>
      </Card>

      {status === "durable" && (
        <p className="text-center text-xs text-muted-foreground">
          {database.openOutcome() === "retried"
            ? "Your expenses are saved in this browser — the database needed a second attempt to open."
            : "Your expenses are saved in this browser."}{" "}
          Database schema v{database.schemaVersion}.
        </p>
      )}
    </div>
  );
}

/**
 * One line pointing at a month other than the one on screen: the month an expense just went to,
 * or the month the tracker's most recent expense lives in, with a button that goes there.
 */
function MonthJump({
  lead,
  date,
  onGo,
  onDismiss,
}: {
  lead: string;
  date: string;
  onGo: () => void;
  onDismiss?: () => void;
}) {
  const target = monthOfDate(date);
  const label = formatMonth(target.year, target.monthIndex);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <p>
        {lead} {label}.
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onGo}>
          Go to {label}
        </Button>
        {onDismiss && (
          <Button variant="ghost" size="icon" className="size-8" aria-label="Dismiss notice" onClick={onDismiss}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}