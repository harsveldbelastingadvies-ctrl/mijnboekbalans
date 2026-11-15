import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { formatDutchDate } from "../../app/lib/dutch-date.ts";

const require = createRequire(import.meta.url), root = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const source = readFileSync(resolve(root, "app/page.tsx"), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const modules = new Map();
function component(path) {
  if (modules.has(path)) return modules.get(path);
  const compiledModule = { exports: {} }; modules.set(path, compiledModule.exports);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: (name) => {
    if (!name.startsWith(".")) return require(name);
    const base = resolve(dirname(path), name), next = [base + ".tsx", base + ".ts", base].find(existsSync);
    return component(next);
  } }); return compiledModule.exports;
}
let jsx, field;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(ast) === "className" && p.initializer?.text === "panel entry-workbench")) jsx = node.getText(ast);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "Field") field = node.getText(ast);
  ts.forEachChild(node, visit);
} visit(ast);
if (!jsx || !field) throw Error("Invoice form not found");

export function invoiceFixture(type = "income", split = false) {
  const form = { type, date: "2026-11-01", vatDate: "invoice", relation: type === "income" ? "Voorbeeldklant" : "Voorbeeldleverancier", invoiceNumber: "2026-0010", description: "Advies en dienstverlening\nSpecificatie van de werkzaamheden", amount: "100,00", amountInclVat: "121,00", vatRate: "21", status: "open", paidDate: "", category: type === "income" ? "Omzet diensten" : "Software", salesVat: { treatment: "nl", country: "NL", foreignVatAmount: "" }, vatLines: [{ id: "v1", amount: "100,00", vatRate: "21", category: "Omzet diensten" }], paymentMethod: "company", wkrType: "none", wkrValue: "", rcDga: "", depreciationYears: "none" };
  if (split) form.vatLines.push({ id: "v2", amount: "50,00", vatRate: "9", category: "Omzet producten" });
  let submissions = 0;
  const context = { entryForm: form, active: { id: "preview", name: "Voorbeeldadministratie", fiscalYear: 2026, autoInvoiceNumbering: false, entries: [] }, editingEntryId: null,
    relationSuggestions: [], period: "q4", entryVatError: "", duplicateSalesInvoiceNumber: false, useAutomaticInvoiceNumber: false, nextSalesInvoiceNumber: "2026-0011",
    entryUsesSplitVatLines: split, entrySalesTotals: { base: split ? 150 : 100, vat: split ? 25.5 : 21, gross: split ? 175.5 : 121 }, enteredAmount: split ? 150 : 100, entryTaxVat: split ? 25.5 : 21, entryVatLinesTotal: split ? 150 : 100, entryVatLinesInclTotal: split ? 175.5 : 121,
    showFinancingTool: false, showNonDeductibleTool: false, showDepreciation: false, retainedInvoiceVatAmount: undefined,
    entryCategories: { income: ["Omzet diensten", "Omzet producten"], expense: ["Software", "Kantoorkosten"] }, money: new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }), formatDutchDate,
    isForeignVat: () => false, salesVatDetails: () => ({}), formatDecimalInput: (n) => String(n).replace(".", ","), roundCents: (n) => Math.round(n * 100) / 100,
    addEntry: (event) => { event.preventDefault(); submissions++; }, setEntryForm: (next) => { context.entryForm = typeof next === "function" ? next(context.entryForm) : next; },
    setQuickContact: () => {}, setEntryVatError: () => {}, updateActive: () => {}, cancelEditEntry: () => {}, addEntryVatLine: () => {}, updateEntryVatLine: () => {}, removeEntryVatLine: () => {},
    require, exports: {},
  };
  for (const [file, names] of [["invoice-entry-summary", ["InvoiceEntrySummary"]], ["relation-picker", ["RelationPicker"]], ["dutch-date-input", ["DutchDateInput"]], ["vat-period-field", ["VatPeriodField"]], ["international-vat-fields", ["InternationalVatFields"]]]) {
    const mod = component(resolve(root, `app/components/${file}.tsx`)); for (const name of names) context[name] = mod[name];
  }
  const code = ts.transpileModule(`${field}\nfunction renderInvoice() { return (${jsx}); }\nglobalThis.renderInvoice = renderInvoice;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, context);
  return { context, render: () => context.renderInvoice(), submissions: () => submissions };
}
