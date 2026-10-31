import assert from "node:assert/strict";
import test from "node:test";
import { buildInternationalVat, salesVatError, salesVatDetails, toSalesVatDraft, emptySalesVat, invoicedVat, dutchVat, allocateForeignVat, isTaxableSalesTurnover } from "../app/lib/international-vat.ts";
import { companyCashAmount } from "../app/lib/payroll-accounting.ts";
import { filterVatPeriod, getVatDate } from "../app/lib/vat-period.ts";
const details = (treatment, extra = {}) => ({ ...emptySalesVat, foreignVatAmount: 0, treatment, country: "DE", customerVatId: "DE123456789", vatIdChecked: true, conditionsConfirmed: true, serviceDate: "2026-09-20", ...extra });
const sale = (treatment, amount = 1000, extra = {}) => ({ type: "income", id: "i", status: "open", date: "2026-10-10", amount, vatRate: 0, ...extra, salesVat: details(treatment, extra.salesVat) });

test("EU goods/services reconcile with 3b and ICP per country/VAT id, including credits", () => {
  const entries = [sale("eu_goods"), sale("eu_services", 500), sale("eu_goods", -100), sale("eu_services", 80, { salesVat: { country: "BE", customerVatId: "BE0123456789" } })];
  const result = buildInternationalVat(entries);
  assert.equal(result.rubrics.find((row) => row.code === "3b").basis, 1480);
  assert.equal(result.icpTotal, 1480);
  assert.equal(result.icpDifference, 0);
  const germany = result.icpRows.find((row) => row.country === "DE");
  assert.equal(germany.goods, 900);
  assert.equal(germany.services, 500);
  assert.equal(result.rubrics.reduce((sum, row) => sum + row.vat, 0), 0);
});

test("goods exported to UK/US go to 3a, foreign services stay outside NL VAT, and all remain revenue", () => {
  const entries = [sale("export_goods", 100, { salesVat: { country: "GB", customerType: "private" } }), sale("non_eu_services", 200, { salesVat: { country: "US" } }), sale("exempt", 50, { salesVat: { country: "NL" } })];
  const result = buildInternationalVat(entries);
  assert.equal(result.rubrics.find((row) => row.code === "3a").basis, 100);
  assert.equal(result.excluded.reduce((sum, row) => sum + row.amount, 0), 250);
  assert.equal(entries.reduce((sum, row) => sum + row.amount, 0), 350);
  assert.equal(isTaxableSalesTurnover(entries[0]), true);
  assert.equal(isTaxableSalesTurnover(entries[1]), true);
  assert.equal(isTaxableSalesTurnover(entries[2]), false);
});

test("foreign VAT affects gross cash and open amount but never Dutch VAT; OSS is excluded from 3c", () => {
  const oss = sale("oss", 100, { salesVat: { customerType: "private", foreignVatAmount: 19 } });
  const local = sale("foreign_goods", 200, { salesVat: { foreignVatAmount: 38 } });
  const service = sale("foreign_services", 300, { salesVat: { foreignVatAmount: 57 } });
  assert.equal(invoicedVat(oss), 19);
  assert.equal(companyCashAmount(oss), 119);
  assert.equal(dutchVat(oss), 0);
  const result = buildInternationalVat([oss, local, service]);
  assert.equal(result.rubrics.find((row) => row.code === "3c").basis, 200);
  assert.equal(result.foreignVatTotal, 114);
  assert.equal(result.foreignRows.length, 3);
  assert.equal(result.excluded.reduce((sum, row) => sum + row.amount, 0), 400);
  const credit = sale("oss", -100, { salesVat: { customerType: "private", foreignVatAmount: -19 } });
  assert.equal(companyCashAmount(credit), -119);
  assert.equal(buildInternationalVat([oss, credit]).foreignVatTotal, 0);
});

test("EU service follows performance date across quarters/years while goods keep invoice date", () => {
  const service = sale("eu_services", 100);
  assert.equal(getVatDate(service), "2026-09-20");
  assert.equal(filterVatPeriod([service], 2026, "q3").length, 1);
  assert.equal(filterVatPeriod([service], 2026, "q4").length, 0);
  const crossYear = sale("eu_services", 100, { salesVat: { serviceDate: "2025-12-31" } });
  assert.equal(filterVatPeriod([crossYear], 2025, "q4").length, 1);
  assert.equal(getVatDate(sale("eu_goods")), "2026-10-10");
});

test("validation requires correct region, confirmed conditions, business VAT id and VIES check", () => {
  assert.equal(salesVatError(details("eu_goods"), 100, 0), "");
  assert.ok(salesVatError(details("eu_goods", { country: "GB" }), 100, 0));
  assert.ok(salesVatError(details("eu_goods", { customerType: "private" }), 100, 0));
  assert.ok(salesVatError(details("eu_goods", { vatIdChecked: false }), 100, 0));
  assert.ok(salesVatError(details("eu_goods", { customerVatId: "BE0123456789" }), 100, 0));
  assert.ok(salesVatError(details("eu_goods", { conditionsConfirmed: false }), 100, 0));
  assert.ok(salesVatError(details("eu_services", { serviceDate: "2026-02-30" }), 100, 0));
  assert.ok(salesVatError(details("export_goods"), 100, 0));
  assert.ok(salesVatError(details("eu_goods"), 100, 21));
  assert.equal(salesVatError(details("eu_goods", { country: "XI", customerVatId: "XI123456789" }), 100, 0), "");
  assert.ok(salesVatError(details("eu_services", { country: "XI", customerVatId: "XI123456789" }), 100, 0));
  assert.equal(salesVatError(details("eu_services", { country: "GR", customerVatId: "EL123456789" }), 100, 0), "");
  assert.ok(salesVatError(details("nl", { country: "US", conditionsConfirmed: false }), 100, 21));
});

test("foreign amounts require explicit values/sign; snapshots retain metadata and foreign tax", () => {
  assert.ok(salesVatError(salesVatDetails({ ...emptySalesVat, treatment: "oss", country: "DE", customerType: "private", conditionsConfirmed: true }), 100, 0));
  assert.ok(salesVatError(details("oss", { customerType: "private", foreignVatAmount: 19 }), -100, 0));
  assert.equal(salesVatError(details("oss", { customerType: "private", foreignVatAmount: -19 }), -100, 0), "");
  const original = details("oss", { customerType: "private", foreignVatAmount: 19.25, evidence: "Dossier 1" });
  const restored = salesVatDetails(toSalesVatDraft(JSON.parse(JSON.stringify(original))));
  assert.deepEqual(restored, original);
  assert.deepEqual(allocateForeignVat(0.01, [1, 1, 1]), [0, 0, 0.01]);
  assert.deepEqual(allocateForeignVat(-19, [-50, -50]), [-9.5, -9.5]);
});

test("legacy Dutch VAT and purchases are unchanged; payroll/balance rows do not enter sales rubrics", () => {
  const legacy = { type: "income", amount: 100, vatRate: 21, date: "2026-09-01" };
  const purchase = { ...legacy, type: "expense" };
  assert.equal(companyCashAmount(legacy), 121);
  assert.equal(dutchVat(purchase), 21);
  assert.equal(salesVatError(undefined, 100, 21), "");
  const result = buildInternationalVat([legacy, purchase, { ...legacy, balanceOnly: true }, { ...legacy, salaryRecordId: "s" }]);
  assert.equal(result.rubrics.find((row) => row.code === "1a").basis, 100);
  assert.equal(result.rubrics.find((row) => row.code === "1a").vat, 21);
  assert.equal(isTaxableSalesTurnover({ ...legacy, vatRate: 0 }), false); // Ambiguous old 0% row: review, not silently exempt.
});

test("invoice recognition retains a foreign sales rate, customer country and signed credit amounts", async () => {
  const { readFileSync } = await import("node:fs");
  const { default: ts } = await import("typescript");
  const { default: vm } = await import("node:vm");
  const source = ts.createSourceFile("route.ts", readFileSync(new URL("../app/api/invoices/analyze/route.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const names = ["normalizeAnalysis", "getString", "parseRecord", "hasStrongIdentifierMatch", "normalizeId", "normalizeSearchText", "hasNameMatch", "isFiniteNonZero", "roundCents"];
  const code = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => node.getText(source)).join("\n");
  const context = vm.createContext({});
  vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2020 }), context);
  const data = { type: "income", date: "2026-09-30", invoiceNumber: "F1", customerCountry: "de", customerVatNumber: "DE123456789", amountExVat: 100, amountVat: 19, amountInclVat: 119, vatRate: 19, vatLines: [{ amountExVat: 100, vatRate: 19 }] };
  const result = context.normalizeAnalysis(data, "{}");
  assert.equal(result.vatRate, 19);
  assert.equal(result.vatLines[0].vatRate, 19);
  assert.equal(result.customerCountry, "DE");
  assert.equal(result.amountInclVat, 119);
  const credit = context.normalizeAnalysis({ ...data, description: "Creditnota", amountExVat: -100, amountVat: -19, amountInclVat: -119, vatLines: [{ amountExVat: -100, vatRate: 19 }] }, "{}");
  assert.equal(credit.amountExVat, -100);
  assert.equal(credit.amountVat, -19);
});
