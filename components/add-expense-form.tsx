"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsHydrated } from "@/lib/storage/react";
import { addExpense, CATEGORIES, localDateISO, type Category } from "@/lib/data/expenses";

/**
 * The add-expense form. Renders the categories from the data module, validates the amount
 * inline, and reports the outcome with a toast once the write has actually resolved.
 */
export function AddExpenseForm({ onSaved }: { onSaved: () => void }) {
  const hydrated = useIsHydrated();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category["id"]>("food");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const today = hydrated ? localDateISO(new Date()) : "";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = amount.trim();
    if (trimmed === "") {
      setError("Enter an amount.");
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive amount, like 12.50.");
      return;
    }
    const chosenDate = date || today;
    setPending(true);
    try {
      await addExpense({
        amountCents: Math.round(value * 100),
        category,
        date: chosenDate,
      });
      toast.success(`Added ${categoryLabelOf(category)} expense of ${format(value)}`);
      setAmount("");
      setDate("");
      setError(null);
      onSaved();
    } catch (cause) {
      toast.error(`Could not save the expense: ${cause instanceof Error ? cause.message : "unknown error"}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="expense-amount">Amount</Label>
        <Input
          id="expense-amount"
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? "expense-amount-error" : undefined}
        />
        {error && (
          <p id="expense-amount-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="expense-category">Category</Label>
        <Select value={category} onValueChange={(value) => setCategory(value as Category["id"])}>
          <SelectTrigger id="expense-category" name="category" className="w-full">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="expense-date">Date</Label>
        <Input
          id="expense-date"
          name="date"
          type="date"
          value={date || today}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add expense"}
      </Button>
    </form>
  );
}

function categoryLabelOf(id: Category["id"]): string {
  return CATEGORIES.find((option) => option.id === id)?.label ?? id;
}

function format(value: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}