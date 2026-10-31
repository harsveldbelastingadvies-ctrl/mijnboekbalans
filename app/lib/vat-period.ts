import { deductibleExpenseVat } from "./expense-tax.ts";
export type VatDatedEntry = {
  inputVatBlocked?: boolean;
  inputVatAmount?: number;
  expenseTaxRule?: "standard" | "restaurant_ib" | "restaurant_vpb" | "manual";
  date: string;
  vatDate?: string;
  salesVat?: { treatment: string; serviceDate: string };
  type: "income" | "expense";
  amount: number;
  vatRate: number;
  balanceOnly?: boolean;
  salaryRecordId?: string;
  payrollDeclarationId?: string;
};

export type VatPeriod = "year" | "q1" | "q2" | "q3" | "q4";
const quarter = (date: string) => Math.ceil(Number(date.slice(5, 7)) / 3);
export const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

// Never move sales, payroll or balance entries through purchase VAT selection.
export function getVatDate(entry: VatDatedEntry) {
  if (entry.type === "income" && entry.salesVat?.treatment === "eu_services" && isDate(entry.salesVat.serviceDate) && !entry.balanceOnly && !entry.salaryRecordId && !entry.payrollDeclarationId) return entry.salesVat.serviceDate;
  return entry.type === "expense" && !entry.balanceOnly && !entry.salaryRecordId && !entry.payrollDeclarationId &&
    entry.vatDate && isDate(entry.vatDate) ? entry.vatDate : entry.date;
}

export function filterVatPeriod<T extends VatDatedEntry>(entries: T[], year: number, period: VatPeriod) {
  return entries.filter((entry) => {
    const date = getVatDate(entry);
    return Number(date.slice(0, 4)) === year && (period === "year" || `q${quarter(date)}` === period);
  });
}

export function filterVatMonth<T extends VatDatedEntry>(entries: T[], month: string) {
  return entries.filter((entry) => getVatDate(entry).slice(0, 7) === month);
}

// Only a proposal: the application does not know which return was actually filed.
export function suggestedVatDate(date: string, year: number, period: VatPeriod) {
  if (!isDate(date) || Number(date.slice(0, 4)) !== year) return date;
  if (period === "year") return date;
  const targetQuarter = Number(period.slice(1));
  return quarter(date) < targetQuarter ? `${year}-${String(targetQuarter * 3 - 2).padStart(2, "0")}-01` : date;
}

export function resolveVatDate(type: "income" | "expense", date: string, selection: string | undefined, year: number, period: VatPeriod) {
  if (type === "income" || selection === "invoice") return date;
  return selection || suggestedVatDate(date, year, period);
}

export function vatDateError(type: "income" | "expense", date: string, vatDate: string) {
  if (!isDate(date)) return "Vul een geldige factuurdatum in.";
  if (type === "income" || date === vatDate) return "";
  if (!isDate(vatDate) || date.slice(0, 4) !== vatDate.slice(0, 4) || vatDate < date)
    return "Kies een btw-datum op of na de factuurdatum, binnen hetzelfde boekjaar. Gebruik voor andere jaren de correctie-/suppletieroute.";
  return "";
}

export function isDeferredVat(entry: VatDatedEntry) {
  const date = getVatDate(entry);
  return entry.type === "expense" && date !== entry.date && (date.slice(0, 4) !== entry.date.slice(0, 4) || quarter(date) !== quarter(entry.date));
}

// Aggregate all shifted purchase lines in the affected target quarter, including credit notes.
// Other corrections must also be considered by the preparer; these are not tracked here.
export function deferredVatError(existing: VatDatedEntry[], additions: VatDatedEntry[], deductionPercent = 100) {
  const targets = new Set(additions.filter(isDeferredVat).map((entry) => `${getVatDate(entry).slice(0, 4)}-q${quarter(getVatDate(entry))}`));
  for (const target of targets) {
    const amount = [...existing, ...additions].filter((entry) => isDeferredVat(entry) &&
      `${getVatDate(entry).slice(0, 4)}-q${quarter(getVatDate(entry))}` === target)
      .reduce((sum, entry) => sum + deductibleExpenseVat({ ...entry, salesVat: undefined }, deductionPercent), 0);
    if (Math.abs(Math.round(amount * 100)) > 100000)
      return `De doorgeschoven voorbelasting voor ${target} is samen meer dan € 1.000. Verwerk vergeten voorbelasting via een suppletie; kies daarvoor de oorspronkelijke factuurdatum als btw-datum.`;
  }
  return "";
}
