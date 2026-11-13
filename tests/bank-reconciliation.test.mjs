import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { bankCents, bankOverlapErrors, bankStatementErrors, bankTransactionErrors, normalizeBankStatement, paymentInvoices, proposeBankAllocations, reconcileBankPayments, unlinkBankPayment, validateBankAllocations } from "../app/lib/bank-reconciliation.ts";
import { spreadsheetDate } from "../app/lib/spreadsheet-invoices.ts";
import { getNextInvoiceNumber, hasDuplicateSalesInvoice } from "../app/lib/invoice-numbering.ts";
import { companyCashAmount } from "../app/lib/payroll-accounting.ts";
import { invoicedVat, emptySalesVat, salesVatDetails } from "../app/lib/international-vat.ts";
import { deductibleExpenseVat } from "../app/lib/expense-tax.ts";
import { filterVatPeriod } from "../app/lib/vat-period.ts";

const entry = (extra = {}) => ({ id: "e1", type: "income", invoiceNumber: "2024-0114", date: "2024-08-01", relation: "Klant Jansen", description: "Werk", category: "Omzet diensten", amount: 100, vatRate: 21, status: "open", ...extra });
const tx = (extra = {}) => ({ id: "s1:0", date: "2024-08-15", amount: 121, currency: "EUR", counterparty: "Klant Jansen", description: "Betaling factuur 2024-0114", page: 1, bankId: "", ...extra });
const statement = (extra = {}) => ({ id: "s1", documentId: "doc-1", fileName: "bank.pdf", account: "NL00TEST0000000000", currency: "EUR", openingBalance: 1000, closingBalance: 1121, transactions: [tx()], complete: true, verified: true, note: "", ...extra });
const allocate = (extra = {}) => ({ transactionId: "s1:0", invoiceKey: "2024-0114", amount: 121, ...extra });

test("PDF normalization retains unknowns, source page and signed amounts without inventing dates", () => {
  const output = normalizeBankStatement({ account: "nl00 test", currency: "EUR", openingBalance: 100, closingBalance: 99.01, complete: true, transactions: [{ date: "invalid", amount: -0.99, currency: "EUR", description: "Kosten", counterparty: "Bank", bankId: "id", page: 2 }, { amount: "121", date: "", page: 0 }] }, { digest: "digest", documentId: "doc", fileName: "bron.pdf" });
  assert.equal(output.verified, false); assert.equal(output.account, "NL00TEST");
  assert.equal(output.transactions[0].amount, -0.99); assert.equal(output.transactions[0].date, ""); assert.equal(output.transactions[0].page, 2);
  assert.equal(output.transactions[1].amount, null); assert.equal(output.transactions[1].page, 0);
  assert.ok(bankStatementErrors(output).length);
  assert.throws(() => normalizeBankStatement({ transactions: Array(501).fill({}) }, { digest: "x", documentId: "d", fileName: "big.pdf" }), /maximaal 500/);
});
test("statement totals require all debits and credits and source verification", () => {
  assert.deepEqual(bankStatementErrors(statement()), []);
  assert.match(bankStatementErrors(statement({ closingBalance: 1122 })).join(), /sluit niet aan/);
  assert.match(bankStatementErrors(statement({ transactions: [] })).join(), /Nog geen transacties/);
  assert.throws(() => reconcileBankPayments([entry()], [], [statement({ verified: false })], [allocate()]), /bevestig/);
  for (const extra of [{ amount: 1.234 }, { currency: "USD" }, { date: "2024-02-31" }, { page: 0 }, { amount: null }]) assert.ok(bankTransactionErrors(tx(extra)).length);
});
test("exact invoice reference and amount are proposed; same amount alone is insufficient", () => {
  const invoices = paymentInvoices([entry()]);
  assert.deepEqual(proposeBankAllocations(invoices, [tx()]), [allocate()]);
  assert.deepEqual(proposeBankAllocations(invoices, [tx({ counterparty: "", description: "Ontvangst" })]), []);
  assert.deepEqual(proposeBankAllocations(invoices, [tx({ description: "2024-01140", counterparty: "Onbekend" })]), []);
  assert.deepEqual(proposeBankAllocations(invoices, [tx({ description: "2024-0114/1" })]), []);
  assert.deepEqual(proposeBankAllocations(invoices, [tx({ description: "ABC-2024-0114" })]), []);
  assert.deepEqual(proposeBankAllocations(invoices, [tx({ description: "2024-9999" })]), []);
  assert.deepEqual(proposeBankAllocations(invoices, [tx({ description: "2024 0114" })]), [allocate()]);
});
test("a reciprocal unique customer name + amount may be proposed, but ambiguous names/amounts remain open", () => {
  const invoice = paymentInvoices([entry()]), payment = tx({ description: "Bedankt" });
  assert.equal(proposeBankAllocations(invoice, [payment]).length, 1);
  assert.deepEqual(proposeBankAllocations(paymentInvoices([entry(), entry({ id: "e2", invoiceNumber: "2024-0115" })]), [payment]), []);
  assert.deepEqual(proposeBankAllocations(invoice, [payment, tx({ id: "s1:1", description: "Dank", date: "2024-08-16" })]), []);
});
test("automatic proposals never pair advances, foreign currency, opposite directions or already paid invoices", () => {
  const invoice = paymentInvoices([entry()]);
  for (const extra of [{ date: "2024-07-31" }, { currency: "USD" }, { amount: -121 }, { allocations: [{ invoiceKey: "old", amount: 121, entryIds: ["old"] }] }]) assert.deepEqual(proposeBankAllocations(invoice, [tx(extra)]), []);
  assert.deepEqual(paymentInvoices([entry({ status: "paid" })]), []);
  assert.deepEqual(proposeBankAllocations(invoice, [tx(), tx({ id: "s1:1", amount: -121, description: "Storno factuur 2024-0114" })]), []);
});
test("split payments and combined invoice payments are suggested only when all amounts reconcile", () => {
  const split = [tx({ amount: 60 }), tx({ id: "s1:1", date: "2024-09-01", amount: 61 })];
  assert.equal(proposeBankAllocations(paymentInvoices([entry()]), split).length, 2);
  assert.deepEqual(proposeBankAllocations(paymentInvoices([entry()]), [split[0]]), []);
  const invoices = paymentInvoices([entry(), entry({ id: "e2", invoiceNumber: "2024-0115", amount: 200 })]);
  assert.equal(proposeBankAllocations(invoices, [tx({ amount: 363, description: "2024-0114 en 2024-0115" })]).length, 2);
  assert.deepEqual(proposeBankAllocations(invoices, [tx({ amount: 360, description: "2024-0114 en 2024-0115" })]), []);
});
test("partial, excess, repeated or invalid allocations cannot change records", () => {
  const invoices = paymentInvoices([entry()]);
  for (const allocations of [[allocate({ amount: 120 })], [allocate(), allocate()], [allocate({ invoiceKey: "missing" })], [allocate({ amount: -121 })], [allocate({ amount: NaN })]]) assert.ok(validateBankAllocations(invoices, [tx()], allocations).length);
  assert.throws(() => reconcileBankPayments([entry()], [], [statement({ transactions: [tx({ amount: 60 })], closingBalance: 1060 })], [allocate({ amount: 60 })]), /nog niet volledig/);
});
test("confirmed reconciliation changes only payment fields, retaining VAT, invoice dates, metadata and unmatched transactions", () => {
  const original = entry({ sourceInvoice: { originalVat: 21 }, documentId: "invoice-pdf" }), untouched = entry({ id: "other", invoiceNumber: "2024-0115" });
  const source = statement({ transactions: [tx(), tx({ id: "s1:1", amount: -5, description: "Bankkosten" })], closingBalance: 1116 });
  const before = structuredClone({ original, untouched, source });
  const result = reconcileBankPayments([original, untouched], [], [source], [allocate()]);
  assert.equal(result.entries[0].status, "paid"); assert.equal(result.entries[0].paidDate, "2024-08-15");
  assert.equal(result.entries[0].date, "2024-08-01"); assert.equal(result.entries[0].invoiceVatAmount, original.invoiceVatAmount);
  assert.equal(result.entries[0].sourceInvoice, original.sourceInvoice); assert.equal(result.entries[0].documentId, "invoice-pdf");
  assert.equal(result.entries[1], untouched); assert.equal(result.bankStatements[0].transactions[1], source.transactions[1]);
  assert.equal(result.bankStatements[0].transactions[0].allocations[0].entryIds[0], "e1");
  assert.deepEqual({ original, untouched, source }, before);
  assert.deepEqual(proposeBankAllocations(paymentInvoices(result.entries), result.bankStatements[0].transactions), []);
});
test("unmatched stored payments can be combined with a later statement to close an invoice", () => {
  const old = statement({ transactions: [tx({ amount: 60 })], closingBalance: 1060 });
  const later = statement({ id: "s2", fileName: "volgende.pdf", openingBalance: 1060, closingBalance: 1121, transactions: [tx({ id: "s2:0", amount: 61, date: "2024-09-01" })] });
  const parts = proposeBankAllocations(paymentInvoices([entry()]), [...old.transactions, ...later.transactions]);
  const result = reconcileBankPayments([entry()], [old], [later], parts);
  assert.equal(result.entries[0].paidDate, "2024-09-01");
  assert.deepEqual(result.entries[0].bankPayments.map((payment) => [payment.date, payment.amount]), [["2024-08-15", 60], ["2024-09-01", 61]]);
});
test("split VAT rows preserve every cent across partial receipts and VAT allocation", () => {
  const rows = [entry({ amount: 27.55, invoiceVatAmount: 5.78 }), entry({ id: "e2", amount: 55.1, invoiceVatAmount: 11.57 })];
  const total = 100, source = statement({ closingBalance: 1100, transactions: [tx({ amount: 50 }), tx({ id: "s1:1", amount: 50, date: "2024-09-01" })] });
  const parts = proposeBankAllocations(paymentInvoices(rows), source.transactions);
  const result = reconcileBankPayments(rows, [], [source], parts);
  for (const [index, row] of result.entries.entries()) {
    assert.equal(row.bankPayments.reduce((sum, part) => sum + bankCents(part.amount), 0), bankCents(rows[index].amount + rows[index].invoiceVatAmount));
    assert.equal(row.bankPayments.reduce((sum, part) => sum + bankCents(part.vatAmount), 0), bankCents(rows[index].invoiceVatAmount));
  }
  assert.equal(result.entries.flatMap((row) => row.bankPayments).reduce((sum, payment) => sum + bankCents(payment.amount), 0), total * 100);
});
test("credit refunds retain negative payment amounts and exact VAT", () => {
  const rows = [entry({ amount: -100, invoiceVatAmount: -21 })], source = statement({ closingBalance: 879, transactions: [tx({ amount: -121 })] });
  const result = reconcileBankPayments(rows, [], [source], proposeBankAllocations(paymentInvoices(rows), source.transactions));
  assert.equal(result.entries[0].bankPayments[0].amount, -121); assert.equal(result.entries[0].bankPayments[0].vatAmount, -21);
});
test("same PDF and strong bank IDs cannot be imported twice; overlapping statements require explicit review", () => {
  const old = statement(), repeated = statement({ id: "s2", fileName: "overlap.pdf", transactions: [tx({ id: "s2:0" })] });
  assert.match(bankOverlapErrors([old], [old]).join(), /al geïmporteerd/);
  assert.match(bankOverlapErrors([old], [repeated]).join(), /overlappend/);
  assert.deepEqual(bankOverlapErrors([old], [repeated], ["s2:0"]), []);
  old.transactions[0].bankId = "unique-bank-id"; repeated.transactions[0].bankId = "unique-bank-id";
  assert.match(bankOverlapErrors([old], [repeated], ["s2:0"]).join(), /banktransactie-ID bestaat al/);
  repeated.transactions[0].bankId = "different-bank-id";
  assert.deepEqual(bankOverlapErrors([old], [repeated]), []);
});
test("unlinking a bundled/split payment reverses the entire connected group and keeps source data", () => {
  const rows = [entry(), entry({ id: "e2", invoiceNumber: "2024-0115", amount: 100 })];
  const source = statement({ closingBalance: 1242, transactions: [tx({ amount: 181.5 }), tx({ id: "s1:1", amount: 60.5, description: "restant" })] });
  const parts = [allocate({ amount: 121 }), allocate({ invoiceKey: "2024-0115", amount: 60.5 }), allocate({ transactionId: "s1:1", invoiceKey: "2024-0115", amount: 60.5 })];
  const matched = reconcileBankPayments(rows, [], [source], parts);
  const undone = unlinkBankPayment(matched.entries, matched.bankStatements, "s1:0");
  assert.deepEqual(undone.entries.map((row) => row.status), ["open", "open"]);
  assert.ok(undone.entries.every((row) => !row.bankPayments && !row.bankPaymentIds && !row.paidDate));
  assert.ok(undone.bankStatements[0].transactions.every((row) => !row.allocations));
  assert.equal(undone.bankStatements[0].documentId, "doc-1"); assert.equal(matched.entries[0].status, "paid");
});

const source = ts.createSourceFile("page.tsx", readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
test("actual monthly reporting uses each receipt's date, including receipts in a later year, and leaves VAT periods unchanged", () => {
  const rows = [entry()], input = statement({ closingBalance: 1121, transactions: [tx({ amount: 60 }), tx({ id: "s1:1", amount: 61, date: "2025-01-15" })] });
  const result = reconcileBankPayments(rows, [], [input], proposeBankAllocations(paymentInvoices(rows), input.transactions));
  const names = ["buildMonthlySpendableOverview", "getMonthKeyFromDate", "getMonthLabel", "getEntryVatAmount"];
  const declarations = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => node.getText(source)).join("\n");
  const context = vm.createContext({ invoicedVat, companyCashAmount, deductibleExpenseVat });
  vm.runInContext(ts.transpile(declarations, { target: ts.ScriptTarget.ES2022 }), context);
  assert.equal(context.buildMonthlySpendableOverview(result.entries, 2024)[7].paidIncomeInclVat, 60);
  assert.equal(context.buildMonthlySpendableOverview(result.entries, 2025)[0].paidIncomeInclVat, 61);
  assert.equal(filterVatPeriod(result.entries, 2024, "q3").length, 1);
  assert.equal(filterVatPeriod(result.entries, 2025, "q1").length, 0);
});

test("actual combined import handler appends Excel invoices and bank evidence without replacing any administration or old entry", () => {
  const old = entry({ id: "old", invoiceNumber: "2024-0001" }), active = { id: "edego", fiscalYear: 2024, entries: [old], contacts: [{ id: "contact" }], recovery: { preserve: true } };
  const other = { id: "other", entries: [{ id: "unrelated" }] }, state = { administrations: [active, other], tab: "invoices" };
  let id = 0;
  const context = vm.createContext({ active, activeInvoiceDrafts: [], uid: () => `new-${++id}`, spreadsheetDate, hasDuplicateSalesInvoice, getNextInvoiceNumber, reconcileBankPayments, emptySalesVat, salesVatDetails,
    setAdministrations: (fn) => { state.administrations = fn(state.administrations); }, setTab: (value) => { state.tab = value; }, setPeriod: () => {}, setInvoiceImportStatus: () => {} });
  const declarations = [];
  function visit(node) { if (ts.isVariableDeclaration(node) && ["updateActive", "bookSpreadsheetWithBank"].includes(node.name.getText(source))) declarations.push(`const ${node.getText(source)};`); ts.forEachChild(node, visit); }
  visit(source); vm.runInContext(ts.transpile(declarations.join("\n") + "\nglobalThis.book = bookSpreadsheetWithBank;", { target: ts.ScriptTarget.ES2022 }), context);
  const imported = { ...entry(), invoiceVatAmount: 21 }; delete imported.id;
  assert.equal(context.book([imported], { statements: [statement()], allocations: [allocate()], acceptedSimilarIds: [] }), true);
  assert.equal(state.administrations[0].entries[1], old); assert.equal(state.administrations[1], other);
  assert.equal(state.administrations[0].contacts, active.contacts); assert.equal(state.administrations[0].recovery, active.recovery);
  assert.equal(state.administrations[0].entries[0].status, "paid"); assert.equal(state.administrations[0].bankStatements[0].documentId, "doc-1");
  assert.equal(state.tab, "entries");
});
