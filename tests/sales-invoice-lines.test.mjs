import assert from "node:assert/strict";
import test from "node:test";
import { emptySalesVat, buildInternationalVat } from "../app/lib/international-vat.ts";
import { resolveSalesInvoiceLines, salesInvoiceLinesError, salesInvoiceTotals } from "../app/lib/sales-invoice-lines.ts";
import { getNextInvoiceNumber } from "../app/lib/invoice-numbering.ts";
import { filterVatPeriod } from "../app/lib/vat-period.ts";
const vat = (patch = {}) => ({ ...emptySalesVat, conditionsConfirmed: true, ...patch });
const mixed = (sign = 1) => [
  { amount: 100 * sign, vatRate: 21, salesVat: vat() },
  { amount: 200 * sign, vatRate: 9, salesVat: vat() },
  { amount: 50 * sign, vatRate: 0, salesVat: vat({ treatment: "exempt" }) },
  { amount: 75 * sign, vatRate: 0, salesVat: vat({ treatment: "nl_reverse", customerVatId: "NL123456789B01" }) },
];
const stored = (lines, fallback) => resolveSalesInvoiceLines(lines, fallback).map((line, index) => ({ ...line, id: String(index), date: "2026-11-11", invoiceNumber: "2026-0042" }));
test("mixed sales invoice reconciles gross, VAT rubrics and one invoice number", () => {
  assert.equal(salesInvoiceLinesError(mixed()), "");
  assert.deepEqual(salesInvoiceTotals(mixed()), { base: 425, vat: 39, gross: 464 });
  const entries = stored(mixed());
  const report = buildInternationalVat(entries);
  assert.equal(report.rubrics.find(row => row.code === "1a").basis, 100);
  assert.equal(report.rubrics.find(row => row.code === "1b").vat, 18);
  assert.equal(report.rubrics.find(row => row.code === "1e").basis, 75);
  assert.equal(report.excluded[0].amount, 50);
  assert.equal(report.icpTotal, 0);
  assert.equal(getNextInvoiceNumber({ fiscalYear: 2026, entries }), "2026-0043");
});
test("credit notes reverse amounts, taxes and rubrics", () => {
  assert.equal(salesInvoiceLinesError(mixed(-1)), "");
  assert.deepEqual(salesInvoiceTotals(mixed(-1)), { base: -425, vat: -39, gross: -464 });
  assert.equal(buildInternationalVat(stored(mixed(-1))).rubrics.find(row => row.code === "1e").basis, -75);
});
test("foreign tax stays with its own line and never enters Dutch payable VAT", () => {
  const lines = [{ amount: 100, vatRate: 21, salesVat: vat() }, { amount: 200, vatRate: 0, salesVat: vat({ treatment: "oss", country: "DE", customerType: "private", foreignVatAmount: "38" }) }];
  assert.equal(salesInvoiceLinesError(lines), "");
  assert.deepEqual(salesInvoiceTotals(lines), { base: 300, vat: 59, gross: 359 });
  const report = buildInternationalVat(stored(lines));
  assert.equal(report.foreignVatTotal, 38);
  assert.equal(report.rubrics.reduce((sum, row) => sum + row.vat, 0), 21);
});
test("legacy imported invoices retain shared foreign VAT including rounding remainder", () => {
  const lines = [1, 2, 3].map(amount => ({ amount, vatRate: 0 }));
  const fallback = vat({ treatment: "oss", country: "DE", customerType: "private", foreignVatAmount: "1,01" });
  assert.equal(salesInvoiceLinesError(lines, fallback), "");
  assert.deepEqual(salesInvoiceTotals(lines, fallback), { base: 6, vat: 1.01, gross: 7.01 });
  assert.deepEqual(resolveSalesInvoiceLines(lines, fallback).map(line => line.salesVat.foreignVatAmount), [.17, .34, .5]);
  assert.match(salesInvoiceLinesError(lines, { ...fallback, foreignVatAmount: "" }), /btw-bedrag/);
});
test("validates every row, domestic recipient, confirmation and foreign VAT sign", () => {
  const line = mixed()[3];
  assert.match(salesInvoiceLinesError([{ ...line, salesVat: vat({ treatment: "nl_reverse" }) }]), /btw-id/);
  assert.match(salesInvoiceLinesError([{ ...line, salesVat: { ...line.salesVat, country: "BE" } }]), /Nederlandse ondernemer/);
  assert.match(salesInvoiceLinesError([{ ...line, salesVat: { ...line.salesVat, conditionsConfirmed: false } }]), /Bevestig/);
  assert.match(salesInvoiceLinesError([...mixed(), { amount: NaN, vatRate: 21 }]), /Regel 5/);
  assert.match(salesInvoiceLinesError([{ amount: -100, vatRate: 0, salesVat: vat({ treatment: "oss", country: "DE", customerType: "private", foreignVatAmount: "19" }) }]), /btw-bedrag/);
});
test("EU service line retains its own VAT period and ICP while revenue stays on invoice date", () => {
  const lines = [...mixed(), { amount: 100, vatRate: 0, salesVat: vat({ treatment: "eu_services", country: "BE", customerVatId: "BE0123456789", vatIdChecked: true, serviceDate: "2026-09-30" }) }];
  assert.equal(salesInvoiceLinesError(lines), "");
  const entries = stored(lines);
  const q3 = buildInternationalVat(filterVatPeriod(entries, 2026, "q3"));
  assert.equal(q3.icpTotal, 100);
  assert.equal(q3.icpDifference, 0);
  assert.equal(entries[4].date, "2026-11-11");
});
test("partial input keeps the visible total of completed rows; validation still rejects it", () => {
  const lines = [{ amount: 100, vatRate: 21, salesVat: vat() }, { amount: NaN, vatRate: 9, salesVat: vat() }];
  assert.deepEqual(salesInvoiceTotals(lines), { base: 100, vat: 21, gross: 121 });
  assert.match(salesInvoiceLinesError(lines), /Regel 2/);
});
