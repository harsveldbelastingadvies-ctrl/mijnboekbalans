import { allocateForeignVat, invoicedVat, salesVatDetails, salesVatError, type SalesVatDraft } from "./international-vat.ts";

type SalesLine = { amount: number; vatRate: number; salesVat?: SalesVatDraft };

// Legacy imported invoices have one foreign VAT amount for the whole invoice.
// New lines can each carry their own complete classification and foreign VAT.
export function resolveSalesInvoiceLines(lines: SalesLine[], fallback?: SalesVatDraft) {
  const shared = salesVatDetails(fallback);
  const inherited = lines.filter((line) => !line.salesVat);
  const allocated = allocateForeignVat(shared?.foreignVatAmount ?? 0, inherited.map((line) => line.amount));
  let index = 0;
  return lines.map((line) => ({
    type: "income" as const,
    ...line,
    salesVat: line.salesVat ? salesVatDetails(line.salesVat) : shared ? { ...shared, foreignVatAmount: allocated[index++] } : undefined,
  }));
}

export function salesInvoiceLinesError(lines: SalesLine[], fallback?: SalesVatDraft) {
  const shared = lines.filter((line) => !line.salesVat);
  if (shared.length && fallback) {
    const error = salesVatError(salesVatDetails(fallback), shared.reduce((sum, line) => sum + line.amount, 0), shared[0].vatRate);
    if (error) return error;
  }
  for (const [index, line] of resolveSalesInvoiceLines(lines, fallback).entries()) {
    if (!Number.isFinite(line.amount) || line.amount === 0 || ![0, 9, 21].includes(line.vatRate)) return `Regel ${index + 1}: vul een geldig bedrag en btw-tarief in.`;
    const error = salesVatError(line.salesVat, line.amount, line.vatRate);
    if (error) return `Regel ${index + 1}: ${error}`;
  }
  return "";
}

export function salesInvoiceTotals(lines: SalesLine[], fallback?: SalesVatDraft) {
  const resolved = resolveSalesInvoiceLines(lines.map((line) => ({ ...line, amount: Number.isFinite(line.amount) ? line.amount : 0 })), fallback);
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const base = round(resolved.reduce((sum, line) => sum + line.amount, 0));
  const vat = round(resolved.reduce((sum, line) => sum + (invoicedVat({ ...line, date: "" }) || 0), 0));
  return { base, vat, gross: round(base + vat) };
}
