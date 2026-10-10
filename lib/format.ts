/** Formatting helpers shared by the spending components. Deterministic — no visitor-locale reads. */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 1250 → "12.50", with thousands separators. Amounts are kept in cents throughout the app. */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "2026-10-03" → "3 Oct 2026", parsed by calendar parts so no time zone can shift the day. */
export function formatDateISO(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return `${day} ${SHORT_MONTHS[month - 1]} ${year}`;
}

/** 9, 0 → "October 2026". */
export function formatMonth(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

/** "October 2026" alone, for sentences like "No spending recorded in October 2026". */
export function formatMonthName(monthIndex: number): string {
  return MONTHS[monthIndex];
}
