import assert from "node:assert/strict";
import test from "node:test";
import { prepareExpenseTaxLines, deductibleExpenseVat, expenseTaxError, expenseTaxPreview } from "../app/lib/expense-tax.ts";
import { companyCashAmount, rcEffect, calculateWkr } from "../app/lib/payroll-accounting.ts";
import { invoicedVat } from "../app/lib/international-vat.ts";
import { deferredVatError } from "../app/lib/vat-period.ts";
const row = (extra = {}) => ({ id: "r", date: "2026-09-15", type: "expense", amount: 56.19, vatRate: 9, status: "open", category: "Representatiekosten", relation: "Restaurant", description: "Zakelijke lunch", ...extra });

test("EUR 61.25 restaurant receipt: 9% recorded, VAT blocked, IB correction 12.25 and net tax cost 49", () => {
  const result = prepareExpenseTaxLines([row()], "restaurant_ib", "Lunch met opdrachtgever", false, 0, 100, 61.25)[0];
  assert.equal(result.amount, 56.19);
  assert.equal(result.vatRate, 9);
  assert.equal(invoicedVat(result), 5.06);
  assert.equal(deductibleExpenseVat(result), 0);
  assert.equal(companyCashAmount(result), 61.25);
  assert.equal(result.nonDeductibleAmount, 12.25);
  const preview = expenseTaxPreview(result.amount, invoicedVat(result), "restaurant_ib");
  assert.equal(preview.cost, 61.25);
  assert.equal(preview.deductibleCost, 49);
  assert.equal(preview.correction, 12.25);
});

test("VPB uses 73.5% with rounded correction; credit reverses VAT, gross and correction", () => {
  const result = prepareExpenseTaxLines([row()], "restaurant_vpb", "Diner met klant", false, 0, 100, 61.25)[0];
  assert.equal(result.nonDeductibleAmount, 16.23);
  assert.equal(expenseTaxPreview(56.19, 5.06, "restaurant_vpb").deductibleCost, 45.02);
  const credit = prepareExpenseTaxLines([row({ amount: -56.19 })], "restaurant_ib", "Credit lunch", false, 0, 100, -61.25)[0];
  assert.equal(companyCashAmount(credit), -61.25);
  assert.equal(credit.inputVatAmount, -5.06);
  assert.equal(credit.nonDeductibleAmount, -12.25);
});

test("split restaurant receipt handles mixed VAT and allocates the invoice-level correction once", () => {
  const lines = prepareExpenseTaxLines([row({ amount: 40, vatRate: 9 }), row({ id: "r2", amount: 10, vatRate: 21 })], "restaurant_ib", "Zakendiner");
  assert.equal(lines.reduce((sum, item) => sum + companyCashAmount(item), 0), 55.7);
  assert.equal(lines.reduce((sum, item) => sum + (item.nonDeductibleAmount ?? 0), 0), 11.14);
  assert.equal(lines.reduce((sum, item) => sum + deductibleExpenseVat(item), 0), 0);
  const tiny = prepareExpenseTaxLines([row({ amount: 0.03, vatRate: 0 }), row({ id: "r2", amount: 0.03, vatRate: 0 })], "restaurant_ib", "Afronding");
  assert.equal(tiny.reduce((sum, item) => sum + (item.nonDeductibleAmount ?? 0), 0), 0.01);
});

test("blocked VAT remains blocked under pro rata and does not count toward deferred reclaim limit", () => {
  const result = prepareExpenseTaxLines([row({ vatDate: "2026-10-01", amount: 20000 })], "restaurant_ib", "Zakelijke maaltijd")[0];
  assert.equal(deductibleExpenseVat(result, 50), 0);
  assert.equal(deferredVatError([], [result], 50), "");
  assert.equal(expenseTaxPreview(56.19, 5.06, "restaurant_ib", false, 0, 50).deductibleCost, 49);
});

test("manual corrections and VAT blocking remain independent, with sign and range validation", () => {
  const result = prepareExpenseTaxLines([row({ amount: 100, vatRate: 21 })], "manual", "Onderbouwde correctie", true, 30, 100)[0];
  assert.equal(result.nonDeductibleAmount, 30);
  assert.equal(deductibleExpenseVat(result), 0);
  assert.equal(companyCashAmount(result), 121);
  assert.equal(expenseTaxError("manual", 100, "", -20, 121).length > 0, true);
  assert.ok(expenseTaxError("manual", 100, "", 122, 121));
  assert.ok(expenseTaxError("restaurant_ib", 56.19, ""));
  assert.equal(expenseTaxError("restaurant_ib", 56.19, "Lunch met klant"), "");
  assert.equal(deductibleExpenseVat(row({ amount: 100, vatRate: 21 }), 50), 10.5);
});

test("saving/editing is idempotent; JSON snapshots, DGA current account and WKR retain actual gross", () => {
  const first = prepareExpenseTaxLines([row({ rcDga: "DGA", wkrType: "free" })], "restaurant_ib", "Lunch met relatie", false, 0, 100, 61.25)[0];
  const restored = JSON.parse(JSON.stringify(first));
  assert.deepEqual(prepareExpenseTaxLines([restored], "restaurant_ib", "Lunch met relatie", false, 0, 100, 61.25)[0], first);
  assert.equal(rcEffect(restored), -61.25);
  assert.equal(calculateWkr([restored], 2026, { fiscalWage: 100000, lowerRate: 2, upperRate: 1.18, threshold: 400000 }).used, 61.25);
  const normal = prepareExpenseTaxLines([first], "standard", "", false, 0, 100, 61.25)[0];
  assert.equal(normal.nonDeductibleAmount, undefined);
  assert.equal(deductibleExpenseVat(normal), 5.06);
  assert.equal(normal.inputVatBlocked, false);
});
