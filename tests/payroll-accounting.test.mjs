import assert from "node:assert/strict";
import test from "node:test";
import { calculateWkr, companyCashAmount, filterMonth, monthEnd, operatingEntries, payrollOutstanding, payrollSections, payrollSupplement, payrollTotal, rcLedger, rcSections, salaryDeclarationProposal, syncDeclarationEntries, vatEntries } from "../app/lib/payroll-accounting.ts";
const entry = (extra = {}) => ({ id: "e", date: "2026-10-10", type: "expense", amount: 100, vatRate: 21, description: "Test", relation: "Leverancier", category: "Kantoorkosten", status: "paid", ...extra });
const salary = (extra = {}) => ({ id: "s", period: "2026-10", grossSalary: 5000, netSalary: 3257.5, wageTax: 1500, employerHealthContribution: 242.5, zvwContributionType: "dga_contribution", employeeName: "DGA", status: "paid", paymentDate: "2026-10-25", ...extra });
const declaration = (extra = {}) => ({ id: "d", period: "2026-10", wageTax: 1500, dgaZvw: 242.5, employerZvw: 0, employeeInsurance: 0, endLevy: 0, correction: 0, reference: "123", filedDate: "2026-11-01", payments: [], ...extra });
const admin = (entries = [], salaries = []) => ({ id: "a", name: "BV", fiscalYear: 2026, entries, salaries });
const wkr = { fiscalWage: 58000, lowerRate: 2, upperRate: 1.18, threshold: 400000 };

test("non-insured DGA: remittance is liability settlement, with no duplicate costs or VAT", () => {
  const s = salary(); const d = declaration({ payments: [{ id: "p", date: "2026-11-20", amount: 1742.5, reference: "Betaald" }] });
  assert.deepEqual(salaryDeclarationProposal([s], "2026-10"), { wageTax: 1500, dgaZvw: 242.5, employerZvw: 0 });
  assert.equal(payrollTotal(d), 1742.5); assert.equal(payrollOutstanding(d), 0); assert.equal(payrollSupplement(d, [s]), 0);
  const entries = syncDeclarationEntries(admin([entry({ amount: 5000, vatRate: 0, cashAmount: s.netSalary, salaryRecordId: "s" })], [s]), d, true);
  assert.equal(operatingEntries(entries).reduce((sum, row) => sum + row.amount, 0), 5000);
  assert.equal(entries.reduce((sum, row) => sum + companyCashAmount(row), 0), 5000);
  assert.equal(vatEntries(entries).length, 0);
});

test("insured employee: additional employer premiums and end levy counted once, including corrections", () => {
  const s = salary({ zvwContributionType: "employer_levy", employerHealthContribution: 305, netSalary: 3500 });
  const d = declaration({ dgaZvw: 0, employerZvw: 305, employeeInsurance: 200, endLevy: 80 });
  assert.equal(payrollSupplement(d, [s]), 280);
  const a = admin([entry({ amount: 5305, vatRate: 0, cashAmount: 3500, salaryRecordId: "s" })], [s]);
  const first = syncDeclarationEntries(a, d, true);
  const second = syncDeclarationEntries({ ...a, entries: first }, d, true);
  assert.deepEqual(second, first); assert.equal(operatingEntries(second).reduce((sum, row) => sum + row.amount, 0), 5585);
  const changed = syncDeclarationEntries({ ...a, entries: second }, { ...d, employeeInsurance: 250 }, true);
  assert.equal(operatingEntries(changed).reduce((sum, row) => sum + row.amount, 0), 5635);
});

test("partial remittances, refunds and cross-year payment dates retain correct outstanding balances", () => {
  const d = declaration({ correction: -100, payments: [{ id: "p1", date: "2027-01-10", amount: 1000, reference: "1" }, { id: "p2", date: "2027-01-11", amount: -50, reference: "refund" }] });
  assert.equal(payrollOutstanding(d), 692.5);
  const entries = syncDeclarationEntries(admin(), d, false);
  assert.equal(entries[1].type, "income"); assert.equal(vatEntries(entries).length, 0); assert.equal(operatingEntries(entries).length, 0);
  assert.equal(filterMonth(entries, "2027-01").length, 2); assert.equal(filterMonth(entries, "2026-10").length, 0);
  assert.equal(syncDeclarationEntries(admin(entries), { ...d, payments: [] }, false).length, 0);
});

test("WKR uses fiscal wages, both brackets, gross cost valuations and only designated free-space items", () => {
  const entries = [entry({ id: "free", amount: 1000, wkrType: "free" }), entry({ id: "exempt", amount: 300, wkrType: "exempt" }), entry({ id: "nil", amount: 500, wkrType: "nil" }), entry({ id: "private", wkrType: "free", balanceOnly: true }), entry({ id: "old", date: "2025-12-31", wkrType: "free" })];
  const result = calculateWkr(entries, 2026, wkr);
  assert.equal(result.allowance, 1160); assert.equal(result.used, 1210); assert.equal(result.excess, 50); assert.equal(result.finalLevy, 40); assert.equal(result.entries.length, 3);
  assert.equal(calculateWkr([], 2026, { ...wkr, fiscalWage: 1000000 }).allowance, 15080);
  assert.equal(calculateWkr([entry({ wkrType: "free", wkrValue: 100 })], 2026, wkr).used, 100);
  assert.equal(calculateWkr([entry({ wkrType: "free", amount: -100 })], 2026, wkr).used, -121);
});

test("RC business expenses credit DGA including VAT without using company cash", () => {
  const business = entry({ rcDga: "Fred", paidDate: "2026-11-01" });
  assert.equal(companyCashAmount(business), 0); assert.equal(operatingEntries([business]).length, 1); assert.equal(vatEntries([business]).length, 1);
  assert.equal(rcLedger([business], "fred", "2026-10").closing, 0);
  assert.equal(rcLedger([business], "Fred", "2026-11").closing, -121);
});

test("RC month report carries full opening balance, separates DGAs and private balances from operating/VAT entries", () => {
  const rows = [
    entry({ id: "opening", date: "2025-12-31", balanceOnly: true, cashAmount: 0, rcDga: "Fred", rcAmount: 1000 }),
    entry({ id: "private", balanceOnly: true, rcDga: "Fred", rcAmount: 200, amount: 200, vatRate: 0 }),
    entry({ id: "business", rcDga: "Fred" }),
    entry({ id: "deposit", balanceOnly: true, type: "income", rcDga: "Fred", rcAmount: -300, amount: 300, vatRate: 0 }),
    entry({ id: "other", rcDga: "Other" }),
  ];
  const ledger = rcLedger(rows, "Fred", "2026-10"); assert.equal(ledger.opening, 1000); assert.equal(ledger.closing, 779); assert.equal(ledger.rows.length, 3);
  assert.equal(rcLedger(rows, "Fred", "2026-11").opening, 779); assert.equal(rcLedger(rows, "Fred", "2026-11").rows.length, 0);
  assert.equal(operatingEntries(rows).length, 2); assert.equal(vatEntries(rows).length, 2); assert.equal(companyCashAmount(rows[0]), 0);
  assert.equal(rcSections(rows, "Fred", "2026-10")[1].rows.length, 3);
});

test("month filter includes credit notes and exact calendar/year boundaries", () => {
  const rows = [entry({ date: "2026-01-01" }), entry({ date: "2026-01-31", amount: -100 }), entry({ date: "2026-02-01" }), entry({ date: "2025-01-01" })];
  assert.equal(filterMonth(rows, "2026-01").length, 2);
  assert.equal(filterMonth(rows, "2026-12").length, 0);
  assert.equal(monthEnd("2026-02"), "2026-02-28"); assert.equal(monthEnd("2024-02"), "2024-02-29");
  assert.equal(payrollSections(declaration(), [salary()])[0].rows[6][1], "€ 1.742,50");
});
