import { invoicedVat, type SalesEntry } from "./international-vat.ts";
export type ExpenseTaxRule = "standard" | "restaurant_ib" | "restaurant_vpb" | "manual";
export const expenseTaxOptions = [
  ["standard", "Geen extra fiscale correctie"],
  ["restaurant_ib", "Restaurant: zakelijke maaltijd · IB, 80% aftrek"],
  ["restaurant_vpb", "Restaurant: zakelijke maaltijd · VPB, 73,5% aftrek"],
  ["manual", "Andere kosten: handmatig corrigeren"],
] as const;
export type ExpenseTaxFields = { expenseTaxRule?: ExpenseTaxRule; inputVatBlocked?: boolean; inputVatAmount?: number; nonDeductibleAmount?: number; nonDeductibleNote?: string };
export const expenseCents = (value: number) => Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
export const isRestaurant = (rule?: string) => rule === "restaurant_ib" || rule === "restaurant_vpb";
export function expenseVatBlocked(entry: ExpenseTaxFields) {
  return Boolean(entry.inputVatBlocked || isRestaurant(entry.expenseTaxRule));
}
export function deductibleExpenseVat(entry: SalesEntry & ExpenseTaxFields, percent = 100) {
  if (entry.type !== "expense" || entry.balanceOnly || entry.salaryRecordId || entry.payrollDeclarationId || expenseVatBlocked(entry)) return 0;
  return invoicedVat(entry) * Math.max(0, Math.min(100, percent)) / 100;
}
export function expenseTaxPreview(base: number, vat: number, rule: ExpenseTaxRule, blocked = false, manual = 0, deductionPercent = 100) {
  const deductibleVat = isRestaurant(rule) || blocked ? 0 : vat * Math.max(0, Math.min(100, deductionPercent)) / 100;
  const cost = expenseCents(base + vat - deductibleVat);
  const correction = isRestaurant(rule) ? expenseCents(cost * (rule === "restaurant_ib" ? 0.2 : 0.265)) : rule === "manual" ? manual : 0;
  return { gross: expenseCents(base + vat), vat, deductibleVat, cost, correction, deductibleCost: expenseCents(cost - correction) };
}
export function expenseTaxError(rule: ExpenseTaxRule, amount: number, note: string, manual = 0, maxCost = amount) {
  if (!expenseTaxOptions.some(([key]) => key === rule)) return "Kies een geldige fiscale kostenbehandeling.";
  if (isRestaurant(rule) && !note.trim()) return "Vul het zakelijke doel van de maaltijd in, bijvoorbeeld lunch met opdrachtgever.";
  if (rule === "manual" && (!Number.isFinite(manual) || Math.abs(manual) > Math.abs(maxCost) + 0.005 || amount * manual < 0)) return "De fiscale correctie moet binnen het kostenbedrag vallen en hetzelfde teken hebben als de bon.";
  return "";
}
// Allocate one invoice-level correction; keep its cent remainder on the last line.
export function prepareExpenseTaxLines<T extends SalesEntry>(lines: T[], rule: ExpenseTaxRule, note: string, blocked = false, manual = 0, deductionPercent = 100, receiptGross?: number) {
  const withVat = lines.map((line) => ({ ...line, inputVatAmount: receiptGross !== undefined && lines.length === 1
    ? expenseCents(receiptGross - line.amount) : expenseCents(invoicedVat(line)), inputVatBlocked: isRestaurant(rule) || blocked, expenseTaxRule: rule }));
  const costs = withVat.map((line) => expenseTaxPreview(line.amount, line.inputVatAmount, rule, line.inputVatBlocked, 0, deductionPercent).cost);
  const totalCost = expenseCents(costs.reduce((sum, value) => sum + value, 0));
  const totalCorrection = expenseTaxPreview(totalCost, 0, rule, true, manual, deductionPercent).correction;
  let allocated = 0;
  return withVat.map((line, index) => {
    const correction = index === lines.length - 1 ? expenseCents(totalCorrection - allocated) : expenseCents(totalCost ? totalCorrection * costs[index] / totalCost : 0);
    allocated += correction;
    return { ...line, nonDeductibleAmount: correction || undefined, nonDeductibleNote: note.trim() || undefined };
  });
}
