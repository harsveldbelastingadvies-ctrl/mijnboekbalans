import { invoicedVat, type SalesVatDetails } from "./international-vat.ts";
import type { EmployeePayroll } from "./employee-payroll";
export type AccountingEntryFields = {
  salesVat?: SalesVatDetails;
  payrollSettlement?: "pension" | "deduction";
  payrollSettlementFund?: string;
  balanceOnly?: boolean;
  cashAmount?: number;
  rcDga?: string;
  rcAmount?: number;
  rcKind?: string;
  wkrType?: "free" | "exempt" | "nil";
  wkrValue?: number;
  payrollDeclarationId?: string;
};
export type FinanceEntry = AccountingEntryFields & {
  id: string; date: string; invoiceNumber?: string; description: string; relation: string;
  category: string; type: "income" | "expense"; amount: number; vatRate: number;
  status: "paid" | "open"; paidDate?: string; salaryRecordId?: string;
};
export type FinanceSalary = {
  employeePayroll?: EmployeePayroll;
  id: string; period: string; grossSalary: number; wageTax: number; netSalary: number;
  employeeName: string; employerHealthContribution: number;
  zvwContributionType?: "dga_contribution" | "employer_levy";
  status: "paid" | "open"; paymentDate: string;
};
export type PayrollPayment = { id: string; date: string; amount: number; reference: string };
export type PayrollDeclaration = {
  id: string; period: string; wageTax: number; dgaZvw: number; employerZvw: number;
  employeeInsurance: number; endLevy: number; correction: number;
  reference: string; filedDate: string; payments: PayrollPayment[]; processed?: boolean;
};
export type WkrSettings = { fiscalWage: number; lowerRate: number; upperRate: number; threshold: number };
export type FinanceAdministration = {
  id: string; name: string; fiscalYear: number; entries: FinanceEntry[]; salaries?: FinanceSalary[];
  payrollDeclarations?: PayrollDeclaration[]; wkrSettingsByYear?: Record<string, WkrSettings>;
};
export type FinanceSection = { title: string; headers: string[]; rows: Array<Array<string | number>>; widths: number[]; emptyText?: string };
export const cents = (number: number) => Math.round((number + Number.EPSILON) * 100) / 100;
export const euro = (number: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(number);
export const monthLabel = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
export function filterMonth<T extends { date: string }>(entries: T[], month: string) {
  return entries.filter((entry) => entry.date.slice(0, 7) === month);
}
export function operatingEntries<T extends FinanceEntry>(entries: T[]) {
  return entries.filter((entry) => !entry.balanceOnly);
}
export function vatEntries<T extends FinanceEntry>(entries: T[]) {
  return entries.filter((entry) => !entry.balanceOnly && !entry.salaryRecordId && !entry.payrollDeclarationId);
}
export function companyCashAmount(entry: FinanceEntry) {
  return entry.rcDga && !entry.balanceOnly ? 0 : entry.cashAmount ?? cents(entry.amount + invoicedVat(entry));
}
export function payrollTotal(declaration: PayrollDeclaration) {
  return cents(declaration.wageTax + declaration.dgaZvw + declaration.employerZvw + declaration.employeeInsurance + declaration.endLevy + declaration.correction);
}
export function payrollOutstanding(declaration: PayrollDeclaration) {
  return cents(payrollTotal(declaration) - declaration.payments.reduce((total, payment) => total + payment.amount, 0));
}
export function salaryDeclarationProposal(salaries: FinanceSalary[], month: string) {
  const selected = salaries.filter((salary) => salary.period === month);
  return {
    wageTax: cents(selected.reduce((total, salary) => total + salary.wageTax, 0)),
    dgaZvw: cents(selected.reduce((total, salary) => total + (salary.zvwContributionType !== "employer_levy" ? salary.employerHealthContribution : 0), 0)),
    employeeInsurance: cents(selected.reduce((total, salary) => total + (salary.employeePayroll?.result.insurance ?? 0), 0)),
    employerZvw: cents(selected.reduce((total, salary) => total + (salary.zvwContributionType === "employer_levy" ? salary.employerHealthContribution : 0), 0)),
  };
}
export function payrollSupplement(declaration: PayrollDeclaration, salaries: FinanceSalary[]) {
  // Employer Zvw in the salary cost must not also be booked as declaration cost.
  return cents(declaration.employeeInsurance - salaryDeclarationProposal(salaries, declaration.period).employeeInsurance + declaration.endLevy + declaration.employerZvw - salaryDeclarationProposal(salaries, declaration.period).employerZvw);
}
export function monthEnd(month: string) {
  const [year, number] = month.split("-").map(Number);
  return `${month}-${new Date(year, number, 0).getDate()}`;
}
export function syncDeclarationEntries(admin: FinanceAdministration, declaration: PayrollDeclaration, process: boolean): FinanceEntry[] {
  // Replacing linked rows makes saving, correcting and paying a declaration idempotent.
  const entries = admin.entries.filter((entry) => entry.payrollDeclarationId !== declaration.id);
  if (process) {
    const amount = payrollSupplement(declaration, admin.salaries ?? []);
    if (amount !== 0) entries.push({ id: `${declaration.id}-cost`, payrollDeclarationId: declaration.id,
      date: monthEnd(declaration.period), description: `Werkgeverslasten loonaangifte ${declaration.period}`,
      relation: "Belastingdienst", category: "Werkgeverslasten loonheffingen", type: "expense", amount,
      vatRate: 0, status: "paid", cashAmount: 0 });
  }
  for (const payment of declaration.payments) {
    entries.push({ id: `${declaration.id}-${payment.id}`, payrollDeclarationId: declaration.id,
      date: payment.date, paidDate: payment.date, description: `Betaling loonheffingen ${declaration.period} ${payment.reference}`.trim(),
      relation: "Belastingdienst", category: "Te betalen loonheffingen", type: payment.amount < 0 ? "income" : "expense",
      amount: Math.abs(payment.amount), vatRate: 0, status: "paid", balanceOnly: true });
  }
  return entries;
}
export function calculateWkr(entries: FinanceEntry[], year: number, settings: WkrSettings) {
  const selected = entries.filter((entry) => entry.type === "expense" && !entry.balanceOnly && Number(entry.date.slice(0, 4)) === year && entry.wkrType);
  const value = (entry: FinanceEntry) => entry.wkrValue ?? cents(entry.amount * (1 + entry.vatRate / 100));
  const used = cents(selected.filter((entry) => entry.wkrType === "free").reduce((total, entry) => total + value(entry), 0));
  const allowance = cents(Math.min(settings.fiscalWage, settings.threshold) * settings.lowerRate / 100 + Math.max(0, settings.fiscalWage - settings.threshold) * settings.upperRate / 100);
  const excess = cents(Math.max(0, used - allowance));
  return { entries: selected, used, allowance, remaining: cents(allowance - used), excess, finalLevy: cents(excess * 0.8), value };
}
export function rcEffect(entry: FinanceEntry) {
  if (!entry.rcDga?.trim()) return 0;
  if (entry.balanceOnly) return cents(entry.rcAmount ?? 0);
  return entry.type === "expense" ? -cents(entry.amount * (1 + entry.vatRate / 100)) : 0;
}
export function rcLedger(entries: FinanceEntry[], dga: string, month: string) {
  const matching = entries.filter((entry) => entry.rcDga?.trim().toLowerCase() === dga.trim().toLowerCase())
    .map((entry) => ({ ...entry, date: !entry.balanceOnly ? entry.paidDate || entry.date : entry.date }));
  const opening = cents(matching.filter((entry) => entry.date.slice(0, 7) < month).reduce((total, entry) => total + rcEffect(entry), 0));
  let balance = opening;
  const rows = filterMonth(matching, month).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map((entry) => {
    const effect = rcEffect(entry); balance = cents(balance + effect);
    return { entry, effect, balance };
  });
  return { opening, rows, closing: balance };
}
export function rcSections(entries: FinanceEntry[], dga: string, month: string): FinanceSection[] {
  const ledger = rcLedger(entries, dga, month);
  return [
    { title: `Rekening-courant ${dga}`, headers: ["Onderdeel", "Bedrag"], widths: [340, 171], rows: [
      ["Beginsaldo", euro(ledger.opening)], ["Eindsaldo", euro(ledger.closing)],
      ["Positief saldo", "DGA heeft schuld aan BV"], ["Negatief saldo", "BV heeft schuld aan DGA"],
    ] },
    { title: "Mutaties in de maand (inclusief btw)", headers: ["Datum", "Omschrijving", "Debet DGA", "Credit DGA", "Saldo"], widths: [65, 176, 90, 90, 90],
      rows: ledger.rows.map(({ entry, effect, balance }) => [entry.date, entry.description, effect > 0 ? euro(effect) : "-", effect < 0 ? euro(-effect) : "-", euro(balance)]), emptyText: "Geen mutaties in deze maand." },
  ];
}
export function payrollSections(declaration: PayrollDeclaration, salaries: FinanceSalary[]): FinanceSection[] {
  const costs = payrollSupplement(declaration, salaries);
  const selected = salaries.filter((salary) => salary.period === declaration.period);
  const gross = cents(selected.reduce((total, salary) => total + salary.grossSalary, 0));
  const net = cents(selected.reduce((total, salary) => total + salary.netSalary, 0));
  const proposal = salaryDeclarationProposal(salaries, declaration.period);
  return [
    { title: "Aangifte loonheffingen - vastgelegde bedragen", headers: ["Onderdeel", "Bedrag"], widths: [340, 171], rows: [
      ["Loonbelasting / premie volksverzekeringen", euro(declaration.wageTax)], ["Ingehouden bijdrage Zvw DGA", euro(declaration.dgaZvw)],
      ["Werkgeversheffing Zvw", euro(declaration.employerZvw)], ["Premies werknemersverzekeringen", euro(declaration.employeeInsurance)],
      ["Eindheffingen (inclusief WKR indien aangegeven)", euro(declaration.endLevy)], ["Correcties eerdere tijdvakken", euro(declaration.correction)],
      ["Totaal aangifte", euro(payrollTotal(declaration))], ["Nog te betalen (+) / ontvangen (-)", euro(payrollOutstanding(declaration))],
      ["Betaalkenmerk", declaration.reference || "-"], ["Ingediend op", declaration.filedDate || "Nog niet vastgelegd"],
    ] },
    { title: "Boekhoudkundige verwerking", headers: ["Onderdeel", "Verwerking"], widths: [240, 271], rows: [
      ["Loon, pensioen, Zvw en premies werkgever", "Via gekoppelde salarisregels"], ["Aanvullende werkgeverskosten", euro(costs)],
      ["Status kostenverwerking", declaration.processed ? "Verwerkt" : "Nog niet verwerkt"],
      ["Bruto salarissen tijdvak", euro(gross)], ["Netto salarissen tijdvak", euro(net)],
      ["Overige inhoudingen / aansluitverschil", euro(gross - net - proposal.wageTax - proposal.dgaZvw)],
      ["Betaling aangifte", "Debet loonheffingen / credit bank"], ["Correcties eerdere tijdvakken", "Controleer aansluiting vorige aangiften"],
    ] },
    { title: "Betalingen en teruggaven", headers: ["Datum", "Kenmerk", "Bedrag"], widths: [90, 270, 151],
      rows: declaration.payments.map((payment) => [payment.date, payment.reference || "-", euro(payment.amount)]), emptyText: "Nog geen betalingen vastgelegd." },
  ];
}
