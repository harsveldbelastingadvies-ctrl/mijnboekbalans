import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { previewSpreadsheetInvoices, readInvoiceSpreadsheet, spreadsheetAmount, spreadsheetDate, suggestSpreadsheetHeader, suggestSpreadsheetMapping } from "../app/lib/spreadsheet-invoices.ts";
import { buildInternationalVat, dutchVat, invoicedVat, emptySalesVat, salesVatDetails } from "../app/lib/international-vat.ts";
import { getNextInvoiceNumber, hasDuplicateSalesInvoice } from "../app/lib/invoice-numbering.ts";
import * as XLSX from "xlsx";

const cell = (value) => ({ value, text: value == null ? "" : String(value) });
const headers = ["Factuurnummer", "Factuurdatum", "Klant", "Omschrijving", "Bedrag excl. btw", "Btw-bedrag", "Bedrag incl. btw", "Btw %", "Status", "Betaaldatum", "Openstaand bedrag"];
const row = (overrides = {}) => Object.assign(["2024-0114", "01-08-2024", "VvE Walchersestraat", "Werkzaamheden", 600, 54, 654, 9, "Betaald", "15-08-2024", 0], overrides);
const sheet = (rows) => ({ name: "Verkoopfacturen", rows: [headers, ...rows].map((row) => row.map(cell)), date1904: false });
const mapping = suggestSpreadsheetMapping(headers.map(cell));
const options = { fiscalYear: 2024, defaultVatRate: "", defaultStatus: "open", confirmZeroVat: false };
const preview = (rows, opts = {}, existing = [], columns = mapping) => previewSpreadsheetInvoices(sheet(rows), 0, columns, { ...options, ...opts }, existing);

test("recognizes Dutch export headers, including separate BTW amount and percentage", () => {
  assert.equal(mapping.vatAmount, 5);
  assert.equal(mapping.vatRate, 7);
  assert.equal(Object.keys(mapping).length, 11);
  const input = sheet([row()]); input.rows.unshift([cell("DigiBoox export")], []);
  assert.equal(suggestSpreadsheetHeader(input), 2);
});
test("imports exact source numbers, dates, amounts and payments without mutating the sheet", () => {
  const input = sheet([row()]); const before = structuredClone(input);
  const [invoice] = previewSpreadsheetInvoices(input, 0, mapping, options, []);
  assert.deepEqual(invoice.errors, []);
  assert.deepEqual([invoice.net, invoice.vat, invoice.gross], [600, 54, 654]);
  assert.deepEqual(invoice.entries[0], { type: "income", invoiceNumber: "2024-0114", date: "2024-08-01", relation: "VvE Walchersestraat", description: "Werkzaamheden", category: "Omzet diensten", amount: 600, invoiceVatAmount: 54, vatRate: 9, status: "paid", paidDate: "2024-08-15" });
  assert.deepEqual(input, before);
});
test("keeps formatted leading zero invoice numbers", () => {
  const input = sheet([row({ 0: 114 })]); input.rows[1][0].text = "000114";
  assert.equal(previewSpreadsheetInvoices(input, 0, mapping, options, [])[0].invoiceNumber, "000114");
});
test("Dutch money, numeric Excel values, credits and US formatted values are parsed precisely", () => {
  for (const [value, expected] of [["€ 1.234,56", 1234.56], ["1,234.56", 1234.56], ["1.234", 1234], ["(123,45)", -123.45], ["123,45-", -123.45], [100.25, 100.25]]) assert.equal(spreadsheetAmount(value), expected);
  for (const value of ["", null, "1,2,3", "garbage", "12.3456", 1.234, Infinity]) assert.equal(spreadsheetAmount(value), undefined);
});
test("accepts Excel serial dates including the 1904 epoch and rejects fabricated dates", () => {
  assert.equal(spreadsheetDate(45505), "2024-08-01");
  assert.equal(spreadsheetDate(44043, true), "2024-08-01");
  assert.equal(spreadsheetDate("1/8/2024"), "2024-08-01");
  for (const value of [60, "31-02-2024", "13-11-26", "2024-02-31", "", null]) assert.equal(spreadsheetDate(value), "");
});
test("dates outside the active fiscal year never become bookable", () => {
  assert.match(preview([row({ 1: "13-11-2026" })])[0].errors.join(), /buiten boekjaar 2024/);
  assert.match(preview([row({ 1: "31-02-2024" })])[0].errors.join(), /ongeldig/);
});
test("blocks existing numbers, even across years and case differences", () => {
  assert.match(preview([row({ 0: " Inv-001 " })], {}, ["inv-001"])[0].errors.join(), /bestaat al/);
});
test("groups mixed VAT lines into one invoice and blocks duplicated export rows", () => {
  const [invoice] = preview([row(), row({ 3: "Meerwerk", 4: 200, 5: 42, 6: 242, 7: 21 })], { allowMultipleLines: true });
  assert.equal(invoice.entries.length, 2);
  assert.deepEqual(invoice.errors, []);
  assert.deepEqual([invoice.net, invoice.vat, invoice.gross], [800, 96, 896]);
  assert.match(preview([row(), row()])[0].errors.join(), /Identieke regel/);
  assert.match(preview([row(), row({ 3: "Meerwerk" })])[0].errors.join(), /Factuurnummer staat op meerdere rijen/);
});
test("blocks contradictory invoice dates, debtors and payment dates within a number", () => {
  for (const changes of [{ 1: "02-08-2024" }, { 2: "Andere klant" }, { 9: "16-08-2024" }]) assert.match(preview([row(), row(changes)])[0].errors.join(), /verschillende datums, klanten of betaalgegevens/);
});
test("does not invent VAT for a blended-rate invoice total", () => {
  const columns = { ...mapping, vatRate: undefined };
  assert.match(preview([row({ 4: 100, 5: 15, 6: 115 })], {}, [], columns)[0].errors.join(), /Btw-tarief ontbreekt/);
  assert.equal(preview([row()], {}, [], columns)[0].entries[0].vatRate, 9);
});
test("derives the net amount from gross and rate, or gross and source VAT", () => {
  const columns = { ...mapping, amount: undefined };
  assert.equal(preview([row()], {}, [], columns)[0].entries[0].amount, 600);
  assert.deepEqual(preview([row()], {}, [], { ...columns, vatAmount: undefined })[0].errors, []);
});
test("requires a deliberate rate when insufficient amount columns are provided", () => {
  const columns = { ...mapping, vatRate: undefined, vatAmount: undefined, grossAmount: undefined };
  assert.match(preview([row()], {}, [], columns)[0].errors.join(), /Btw-tarief ontbreekt/);
  assert.deepEqual(preview([row()], { defaultVatRate: "9" }, [], columns)[0].errors, []);
});
test("blocks amount and VAT reconciliation errors", () => {
  assert.match(preview([row({ 6: 700 })])[0].errors.join(), /sluit niet aan/);
  assert.match(preview([row({ 6: 654.01 })])[0].errors.join(), /sluit niet aan/);
  assert.match(preview([row({ 5: 50, 6: 650 })])[0].errors.join(), /Btw-bedrag sluit niet aan/);
  assert.match(preview([row({ 4: "onleesbaar" })])[0].errors.join(), /geen geldig bedrag/);
});
test("retains a cent rounding difference in source VAT in reports and totals", () => {
  const [invoice] = preview([row({ 4: 19.99, 5: 4.19, 6: 24.18, 7: 21 })]);
  assert.deepEqual(invoice.errors, []);
  const entry = { ...invoice.entries[0], salesVat: salesVatDetails({ ...emptySalesVat }) };
  assert.equal(invoicedVat(entry), 4.19);
  assert.equal(dutchVat(entry), 4.19);
  assert.equal(buildInternationalVat([entry]).rubrics.find((row) => row.code === "1a").vat, 4.19);
});
test("credit invoices retain negative net, VAT, gross and paid/open values", () => {
  const [invoice] = preview([row({ 4: -600, 5: -54, 6: -654 })]);
  assert.deepEqual(invoice.errors, []);
  assert.deepEqual([invoice.net, invoice.vat, invoice.gross], [-600, -54, -654]);
});
test("source VAT survives a date/description edit but is recalculated when tax inputs change", () => {
  const entry = { type: "income", date: "2024-08-01", amount: 19.99, vatRate: 21, invoiceVatAmount: 4.19 };
  const source = ts.createSourceFile("page.tsx", readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ["retainedInvoiceVatAmount", "entrySalesTotals"].includes(node.name.getText(source))) declarations.push(`const ${node.getText(source)};`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const evaluate = (editedSalesEntry, amount, vatRate, treatment) => {
    const context = vm.createContext({ editedSalesEntry, entryForm: { type: "income", amount, vatRate, salesVat: { treatment } }, parseAmountInput: Number, calculatedSalesTotals: { base: 19.99, vat: 4.2, gross: 24.19 }, roundCents: (n) => Math.round(n * 100) / 100 });
    vm.runInContext(ts.transpile(declarations.join("\n") + "\nglobalThis.result = { retainedInvoiceVatAmount, entrySalesTotals };", { target: ts.ScriptTarget.ES2022 }), context);
    return context.result;
  };
  const unchanged = evaluate({ ...entry, date: "2024-08-02" }, 19.99, 21, "nl");
  assert.equal(unchanged.retainedInvoiceVatAmount, 4.19);
  assert.equal(unchanged.entrySalesTotals.vat, 4.19);
  assert.equal(unchanged.entrySalesTotals.gross, 24.18);
  assert.equal(evaluate(entry, 20, 21, "nl").retainedInvoiceVatAmount, undefined);
  assert.equal(evaluate(entry, 19.99, 9, "nl").retainedInvoiceVatAmount, undefined);
  assert.equal(evaluate(entry, 19.99, 21, "exempt").retainedInvoiceVatAmount, undefined);
  assert.equal(evaluate(undefined, 19.99, 21, "nl").retainedInvoiceVatAmount, undefined);
});
test("zero percent requires explicit assessment, while unknown rates are blocked", () => {
  assert.match(preview([row({ 5: 0, 6: 600, 7: 0 })])[0].errors.join(), /Beoordeel de 0%-omzet/);
  assert.deepEqual(preview([row({ 5: 0, 6: 600, 7: 0 })], { confirmZeroVat: true })[0].errors, []);
  assert.match(preview([row({ 7: 19 })])[0].errors.join(), /Btw-tarief ontbreekt/);
});
test("does not invent paid dates or accept partial payments", () => {
  assert.match(preview([row({ 9: "" })])[0].errors.join(), /Betaaldatum ontbreekt/);
  assert.match(preview([row({ 10: 100 })])[0].errors.join(), /deelbetaling/);
  assert.match(preview([row({ 8: "Gedeeltelijk betaald" })])[0].errors.join(), /niet herkend/);
  assert.match(preview([row({ 8: "Concept" })])[0].errors.join(), /niet herkend/);
});
test("missing payment data defaults to open and is flagged in review", () => {
  const [invoice] = preview([row()], {}, [], { ...mapping, status: undefined, paidDate: undefined, outstanding: undefined });
  assert.deepEqual(invoice.errors, []);
  assert.equal(invoice.status, "open");
  assert.equal(invoice.entries[0].paidDate, undefined);
  assert.match(invoice.warnings.join(), /Geen betaalstatus/);
});
test("requires mandatory column mappings and avoids mapping a column twice", () => {
  assert.throws(() => preview([row()], {}, [], { ...mapping, date: undefined }), /Koppel factuurnummer/);
  assert.throws(() => preview([row()], {}, [], { ...mapping, amount: mapping.grossAmount }), /maximaal één veld/);
});
test("keeps malformed rows visible, ignores empty rows and explicit summary rows", () => {
  const invoices = preview([row(), [], row({ 0: "Totaal", 1: "" }), row({ 0: "", 1: "" })]);
  assert.equal(invoices.length, 2);
  assert.match(invoices[1].errors.join(), /Factuurnummer ontbreekt/);
});
test("reads CSV bytes as multiple invoice records without AI", async () => {
  const csv = `Factuurnummer;Factuurdatum;Klant;Bedrag excl. btw;Btw-bedrag;Btw %\n000114;01-08-2024;Klant;600;54;9\n000115;02-08-2024;Andere klant;100;21;21`;
  const [input] = await readInvoiceSpreadsheet(new TextEncoder().encode(csv).buffer, "DigiBoox.csv");
  const output = previewSpreadsheetInvoices(input, 0, suggestSpreadsheetMapping(input.rows[0]), options, []);
  assert.equal(output.length, 2);
  assert.equal(output[0].invoiceNumber, "000114");
  assert.equal(output[0].date, "2024-08-01");
  assert.deepEqual(output.map((invoice) => invoice.errors), [[], []]);
});
test("rejects unsupported, empty, damaged and oversized files", async () => {
  await assert.rejects(readInvoiceSpreadsheet(new ArrayBuffer(1), "DigiBoox.pdf"), /Excel-bestand/);
  await assert.rejects(readInvoiceSpreadsheet(new ArrayBuffer(0), "DigiBoox.xlsx"), /maximaal 5 MB/);
  await assert.rejects(readInvoiceSpreadsheet(new TextEncoder().encode("Dit is geen Excel").buffer, "DigiBoox.xlsx"), /geen geldig .xlsx/);
  await assert.rejects(readInvoiceSpreadsheet(new ArrayBuffer(5 * 1024 * 1024 + 1), "DigiBoox.xlsx"), /maximaal 5 MB/);
});

test("reads legacy Excel XML exports, selecting a later header row and preserving Excel dates", async () => {
  const tableRows = [[], headers, row({ 1: 45505 })];
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="DigiBoox"><Table>${tableRows.map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${value}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;
  const [input] = await readInvoiceSpreadsheet(new TextEncoder().encode(xml).buffer, "DigiBoox.xls");
  const header = suggestSpreadsheetHeader(input);
  const output = previewSpreadsheetInvoices(input, header, suggestSpreadsheetMapping(input.rows[header]), options, []);
  assert.equal(header, 1);
  assert.equal(output[0].date, "2024-08-01");
  assert.deepEqual(output[0].errors, []);
});

// Synthetic in-memory reader fixtures; never use or change a user's spreadsheet.
for (const bookType of ["xlsx", "biff8"]) test(`reads real ${bookType} bytes with multiple sheets, formatted numbers and numeric dates`, async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Exportinformatie"]]), "Lees mij");
  const data = XLSX.utils.aoa_to_sheet([["DigiBoox verkoopfacturen"], [], headers, row({ 0: 114, 1: 45505, 9: 45519 })]);
  data.A4.z = "000000";
  data.B4.z = "dd-mm-yyyy";
  data.J4.z = "dd-mm-yyyy";
  XLSX.utils.book_append_sheet(workbook, data, "Verkoopfacturen");
  const bytes = XLSX.write(workbook, { type: "array", bookType });
  const sheets = await readInvoiceSpreadsheet(bytes, `DigiBoox.${bookType === "xlsx" ? "xlsx" : "xls"}`);
  assert.equal(sheets.length, 2);
  const input = sheets[1], header = suggestSpreadsheetHeader(input);
  assert.equal(header, 2);
  const [invoice] = previewSpreadsheetInvoices(input, header, suggestSpreadsheetMapping(input.rows[header]), options, []);
  assert.equal(invoice.invoiceNumber, "000114");
  assert.equal(invoice.date, "2024-08-01");
  assert.equal(invoice.entries[0].paidDate, "2024-08-15");
  assert.deepEqual(invoice.errors, []);
});
test("honors the workbook's 1904 date system and rejects excessive worksheet dimensions", async () => {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { WBProps: { date1904: true } };
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, row({ 1: 44043, 9: 44057 })]), "Facturen");
  const [input] = await readInvoiceSpreadsheet(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "DigiBoox.xlsx");
  assert.equal(input.date1904, true);
  const [invoice] = previewSpreadsheetInvoices(input, 0, suggestSpreadsheetMapping(input.rows[0]), options, []);
  assert.equal(invoice.date, "2024-08-01");
  assert.equal(invoice.entries[0].paidDate, "2024-08-15");
  workbook.Sheets.Facturen["!ref"] = "A1:A20000";
  workbook.Sheets.Facturen.A20000 = { t: "s", v: "Too many rows" };
  await assert.rejects(readInvoiceSpreadsheet(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "DigiBoox.xlsx"), /maximaal 10.000/);
});

// Execute the actual page handlers: imports must append, never replace existing records.
function bookingHarness({ existingNumber = "2024-0001", pendingNumber = "" } = {}) {
  const active = { id: "edego", name: "Edego", fiscalYear: 2024, entries: [{ id: "kept", type: "income", invoiceNumber: existingNumber, date: "2024-01-01", amount: 100, vatRate: 21, sourceInvoice: { note: "retain metadata" } }], contacts: [{ id: "contact" }], recovery: { note: "keep recovery data" } };
  const other = { id: "other", entries: [{ id: "other-entry" }], contacts: [] };
  const state = { administrations: [active, other], status: "", tab: "invoices", period: "q1" };
  let sequence = 0;
  const context = vm.createContext({ active, activeInvoiceDrafts: pendingNumber ? [{ type: "income", invoiceNumber: pendingNumber }] : [], spreadsheetDate, hasDuplicateSalesInvoice, getNextInvoiceNumber, emptySalesVat, salesVatDetails,
    uid: () => `new-${++sequence}`, setAdministrations: (update) => { state.administrations = update(state.administrations); },
    setInvoiceImportStatus: (value) => { state.status = value; }, setTab: (value) => { state.tab = value; }, setPeriod: (value) => { state.period = value; },
  });
  const source = ts.createSourceFile("page.tsx", readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ["bookSpreadsheetEntries", "updateActive"].includes(node.name.getText(source))) declarations.push(`const ${node.getText(source)};`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  vm.runInContext(ts.transpile(declarations.join("\n") + "\nglobalThis.book = bookSpreadsheetEntries;", { target: ts.ScriptTarget.ES2022 }), context);
  return { context, state, active, other };
}
test("actual Excel booking handler preserves every existing entry, contact, metadata and other administration", () => {
  const { context, state, active, other } = bookingHarness();
  const entries = preview([row(), row({ 3: "Andere btw-regel", 4: 100, 5: 21, 6: 121, 7: 21 })], { allowMultipleLines: true })[0].entries;
  assert.equal(context.book(entries), true);
  const after = state.administrations[0];
  assert.equal(after.entries.length, 3);
  assert.equal(after.entries[2], active.entries[0]);
  assert.equal(after.contacts, active.contacts);
  assert.equal(after.recovery, active.recovery);
  assert.equal(state.administrations[1], other);
  assert.equal(active.entries.length, 1);
  assert.deepEqual(Array.from(after.entries.slice(0, 2), (entry) => entry.invoiceVatAmount), [54, 21]);
  assert.equal(after.nextInvoiceNumber, "2024-0115");
  assert.equal(state.tab, "entries");
  assert.equal(state.period, "year");
});
test("actual booking handler rechecks duplicates and pending drafts and refuses dates from another year atomically", () => {
  for (const setup of [{ existingNumber: "2024-0114" }, { pendingNumber: "2024-0114" }, {}]) {
    const { context, state, active, other } = bookingHarness(setup);
    const entries = preview([row()])[0].entries;
    if (!Object.keys(setup).length) entries[0].date = "2026-11-13";
    assert.equal(context.book(entries), false);
    assert.equal(state.administrations[0], active);
    assert.equal(state.administrations[1], other);
    assert.equal(state.tab, "invoices");
  }
});
