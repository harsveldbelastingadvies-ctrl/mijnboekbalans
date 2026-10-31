import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { filterVatPeriod, filterVatMonth, getVatDate, isDeferredVat, resolveVatDate, suggestedVatDate, vatDateError, deferredVatError } from "../app/lib/vat-period.ts";
import { deductibleExpenseVat } from "../app/lib/expense-tax.ts";
import { invoicedVat, dutchVat, buildInternationalVat, usesDutchSalesVat } from "../app/lib/international-vat.ts";
import { companyCashAmount, operatingEntries, vatEntries } from "../app/lib/payroll-accounting.ts";
const entry = (extra = {}) => ({ id: "e", date: "2026-02-15", type: "expense", amount: 100, vatRate: 21, description: "Inkoop", relation: "Leverancier", category: "Kantoorkosten", status: "open", ...extra });

// Exercise the actual page calculations as well as the period selectors, without a browser or user data.
const source = ts.createSourceFile("page.tsx", readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["calculateTotals", "getEntryVatAmount", "getEntryTotalInclVat", "getEntryProfitLossAmount", "getEntryQuarter", "filterEntriesByPeriod", "getQuarterSummaries", "buildVatOverview", "buildMonthlyFinancialOverview", "buildMonthlySpendableOverview", "getMonthKeyFromDate", "getMonthLabel"];
const declarations = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => node.getText(source)).join("\n");
const context = vm.createContext({ operatingEntries, vatEntries, filterVatPeriod, filterVatMonth, getVatDate, isDeferredVat,
  companyCashAmount, deductibleExpenseVat, invoicedVat, dutchVat, buildInternationalVat, usesDutchSalesVat, clampPercent: (n) => Math.max(0, Math.min(100, n)), loanCategory: "Financiering" });
vm.runInContext(ts.transpile(declarations, { target: ts.ScriptTarget.ES2020 }), context);

test("Q1 invoice claimed in Q3 once; costs and open balance remain in Q1", () => {
  const old = entry({ vatDate: "2026-07-01" });
  const fresh = entry({ id: "new", date: "2026-08-20", amount: 200 });
  const rows = [old, fresh];
  const q = context.getQuarterSummaries(rows, 2026);
  assert.equal(q[0].summary.costs, 100);
  assert.equal(q[0].summary.open, 121);
  assert.equal(q[0].summary.vatToClaim, 0);
  assert.equal(q[2].summary.costs, 200);
  assert.equal(q[2].summary.vatToClaim, 63);
  assert.equal(q.reduce((sum, item) => sum + item.summary.vatToClaim, 0), 63);
  assert.equal(context.buildVatOverview(filterVatPeriod(rows, 2026, "q3")).deductibleInputVatTotal, 63);
  const months = context.buildMonthlyFinancialOverview(rows, 2026);
  assert.equal(months[1].costs, 100);
  assert.equal(months[1].vatBalance, 0);
  assert.equal(months[6].vatBalance, -21);
  assert.equal(months[7].vatBalance, -42);
  assert.equal(filterVatMonth(rows, "2026-07")[0].id, "e");
  assert.equal(old.date, "2026-02-15");
});

test("legacy rows, sales, payroll and balance dates are preserved", () => {
  for (const row of [entry(), entry({ type: "income", vatDate: "2026-07-01" }), entry({ balanceOnly: true, vatDate: "2026-07-01" }), entry({ salaryRecordId: "s", vatDate: "2026-07-01" })]) {
    assert.equal(getVatDate(row), "2026-02-15");
    assert.equal(filterVatPeriod([row], 2026, "q1").length, 1);
  }
  assert.equal(getVatDate(entry({ vatDate: "invalid" })), "2026-02-15");
});

test("only new purchases in an explicitly selected later quarter receive a proposal", () => {
  assert.equal(suggestedVatDate("2026-02-15", 2026, "q3"), "2026-07-01");
  assert.equal(suggestedVatDate("2026-08-15", 2026, "q3"), "2026-08-15");
  assert.equal(suggestedVatDate("2026-10-15", 2026, "q3"), "2026-10-15");
  assert.equal(suggestedVatDate("2025-02-15", 2026, "q3"), "2025-02-15");
  assert.equal(suggestedVatDate("2026-02-15", 2026, "year"), "2026-02-15");
  assert.equal(resolveVatDate("income", "2026-02-15", "2026-07-01", 2026, "q3"), "2026-02-15");
  assert.equal(resolveVatDate("expense", "2026-02-15", "invoice", 2026, "q3"), "2026-02-15");
  assert.equal(resolveVatDate("expense", "2026-02-15", "2026-08-01", 2026, "q4"), "2026-08-01");
});

test("date validation rejects earlier dates, invalid dates and crossing a year", () => {
  assert.equal(vatDateError("expense", "2026-02-15", "2026-07-01"), "");
  assert.ok(vatDateError("expense", "2026-02-15", "2026-01-01"));
  assert.ok(vatDateError("expense", "2026-02-15", "2027-01-01"));
  assert.ok(vatDateError("expense", "2026-02-30", "2026-07-01"));
});

test("EUR 1000 limit uses combined deductible VAT, including split lines and credits", () => {
  const row = (vat, extra = {}) => entry({ amount: vat * 10, vatRate: 10, vatDate: "2026-07-01", ...extra });
  assert.equal(deferredVatError([], [row(1000)]), "");
  assert.ok(deferredVatError([], [row(1000.01)]));
  assert.ok(deferredVatError([row(600)], [row(401)]));
  assert.ok(deferredVatError([], [row(600), row(401)]));
  assert.equal(deferredVatError([row(600)], [row(500), row(-100)]), "");
  assert.equal(deferredVatError([], [row(1500)], 50), "");
  assert.ok(deferredVatError([], [row(-1001)]));
  assert.equal(deferredVatError([row(600)], [row(600, { vatDate: "2026-10-01" })]), "");
  assert.equal(context.buildVatOverview([row(100), row(-20)], 50).deductibleInputVatTotal, 40);
});

test("international sales use separate Dutch VAT totals and service dates throughout actual reports", () => {
  const details = (treatment, extra = {}) => ({ treatment, country: "DE", customerType: "business", customerVatId: "DE123456789", vatIdChecked: true, conditionsConfirmed: true, serviceDate: "2026-09-30", evidence: "Dossier", foreignVatAmount: 0, ...extra });
  const service = entry({ id: "service", type: "income", date: "2026-10-10", amount: 1000, vatRate: 0, salesVat: details("eu_services") });
  const oss = entry({ id: "oss", type: "income", date: "2026-09-01", amount: 100, vatRate: 0, salesVat: details("oss", { customerType: "private", foreignVatAmount: 19 }) });
  const domestic = entry({ id: "domestic", type: "income", date: "2026-09-05", amount: 200 });
  const entries = [service, oss, domestic];
  const quarters = context.getQuarterSummaries(entries, 2026);
  assert.equal(quarters[2].summary.revenue, 300);
  assert.equal(quarters[2].summary.open, 361);
  assert.equal(quarters[2].summary.vatToPay, 42);
  assert.equal(quarters[3].summary.revenue, 1000);
  assert.equal(quarters[3].summary.vatToPay, 0);
  const overview = context.buildVatOverview(filterVatPeriod(entries, 2026, "q3"));
  assert.equal(overview.salesVatTotal, 42);
  assert.equal(overview.international.icpTotal, 1000);
  assert.equal(overview.international.foreignVatTotal, 19);
  const months = context.buildMonthlyFinancialOverview(entries, 2026);
  assert.equal(months[8].vatBalance, 42);
  assert.equal(months[9].vatBalance, 0);
});

test("restaurant costs, fiscal add-back, open balance and VAT PDF overview reconcile in actual page code", () => {
  const restaurant = entry({ date: "2026-09-15", amount: 56.19, vatRate: 9, inputVatAmount: 5.06, inputVatBlocked: true, expenseTaxRule: "restaurant_ib", nonDeductibleAmount: 12.25 });
  const totals = context.calculateTotals([restaurant]);
  assert.equal(totals.costs, 61.25);
  assert.equal(totals.nonDeductibleCosts, 12.25);
  assert.equal(totals.vatToClaim, 0);
  assert.equal(totals.open, 61.25);
  assert.equal(-totals.costs + totals.nonDeductibleCosts, -49);
  const overview = context.buildVatOverview([restaurant]);
  assert.equal(overview.inputVatTotal, 5.06);
  assert.equal(overview.deductibleInputVatTotal, 0);
  assert.equal(overview.nonDeductibleInputVatTotal, 5.06);
  const paid = { ...restaurant, status: "paid" };
  const months = context.buildMonthlyFinancialOverview([paid], 2026);
  assert.equal(months[8].paidExpensesInclVat, 61.25);
  assert.equal(months[8].vatBalance, 0);
  assert.equal(months[8].vatReserve, 0);
});
