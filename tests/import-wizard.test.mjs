import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import * as spreadsheet from "../app/lib/spreadsheet-invoices.ts";
import { formatDutchDate } from "../app/lib/dutch-date.ts";

const cells = (row) => row.map((value) => ({ value, text: String(value) }));
const sheet = { name: "Facturen", date1904: false, rows: [cells(["Factuurnummer", "Factuurdatum", "Klant", "Bedrag excl btw", "Btw-bedrag", "Btw %", "Status"]), cells(["2024-0114", "01-08-2024", "Klant Jansen", 100, 21, 21, "Open"])] };
function wizard() {
  const states = []; let cursor = 0;
  const compiledModule = { exports: {} }, jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(readFileSync(new URL("../app/components/spreadsheet-invoice-import.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: compiledModule.exports, module: compiledModule,
    require: (name) => {
      if (name === "react") return { useMemo: (fn) => fn(), useState: (initial) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (update) => { states[i] = typeof update === "function" ? update(states[i]) : update; }]; }, useRef: (initial) => { const i = cursor++; if (!(i in states)) states[i] = { current: initial }; return states[i]; } };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name.includes("spreadsheet-invoices")) return { ...spreadsheet, readInvoiceSpreadsheet: async () => [structuredClone(sheet)] };
      if (name.includes("dutch-date")) return { formatDutchDate };
      if (name.includes("bank-payment-panel")) return { BankPaymentPanel: function MockBankPanel() {} };
      throw new Error(name);
    },
  });
  return { render: (props) => { cursor = 0; return compiledModule.exports.SpreadsheetInvoiceImport(props); } };
}
function nodes(tree, visibleOnly = false) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, visibleOnly));
  if (visibleOnly && tree.props?.hidden) return [];
  return [tree, ...nodes(tree.props?.children, visibleOnly)];
}
const text = (tree) => typeof tree === "string" || typeof tree === "number" ? String(tree) : !tree ? "" : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
const find = (tree, predicate, visible = true) => { const node = nodes(tree, visible).find(predicate); assert.ok(node, "Expected visible control"); return node; };
const props = () => ({ administrationId: "a", administrationName: "Testadministratie", fiscalYear: 2024, existingNumbers: [], existingEntries: [], bankStatements: [], iban: "NL00TEST", pin: "example", onBook: () => true, onReconcile: () => true, onUnlink: () => {} });
const button = (tree, label) => find(tree, (node) => node.type === "button" && text(node).includes(label));
const bankPanel = (tree, visible = true) => find(tree, (node) => typeof node.type === "function" && node.type.name === "MockBankPanel", visible);
const loadExcel = async (tree) => { const input = find(tree, (node) => node.type === "input" && node.props["aria-label"] === "Excel-verkoopfacturen kiezen"); await input.props.onChange({ target: { files: [new File(["test"], "export.xlsx")], value: "x" } }); };

test("wizard starts with a workflow choice, without a wall of upload, column or payment controls", () => {
  const tree = wizard().render(props());
  button(tree, "Facturen met bankbetalingen"); button(tree, "Alleen facturen uit Excel");
  assert.equal(nodes(tree, true).filter((node) => node.type === "select").length, 0);
  assert.equal(nodes(tree, true).filter((node) => node.type === "input" && node.props.type === "file").length, 0);
});
test("Excel-only flow hides advanced columns by default and saves only in the final confirmed step", async () => {
  const runtime = wizard(), input = props(); let booked = 0;
  input.onBook = (entries) => { booked++; assert.equal(entries[0].invoiceNumber, "2024-0114"); return true; };
  let tree = runtime.render(input); button(tree, "Alleen facturen uit Excel").props.onClick(); tree = runtime.render(input);
  await loadExcel(tree); tree = runtime.render(input);
  const settings = find(tree, (node) => node.type === "details" && text(node).includes("Kolommen en importinstellingen"));
  assert.equal(settings.props.open, false); assert.equal(booked, 0);
  button(tree, "Verder naar opslaan").props.onClick(); tree = runtime.render(input);
  assert.equal(button(tree, "Sla 1 facturen op").props.disabled, true);
  const confirmation = find(tree, (node) => node.type === "label" && text(node).includes("Ik heb de facturen, bedragen"));
  find(confirmation, (node) => node.type === "input").props.onChange({ target: { checked: true } });
  tree = runtime.render(input); assert.equal(button(tree, "Sla 1 facturen op").props.disabled, false);
  button(tree, "Sla 1 facturen op").props.onClick(); assert.equal(booked, 1);
});
test("back navigation keeps the loaded spreadsheet and changing a selection invalidates approval", async () => {
  const runtime = wizard(), input = props(); let tree = runtime.render(input);
  button(tree, "Alleen facturen uit Excel").props.onClick(); tree = runtime.render(input); await loadExcel(tree); tree = runtime.render(input);
  button(tree, "Verder naar opslaan").props.onClick(); tree = runtime.render(input);
  const label = find(tree, (node) => node.type === "label" && text(node).includes("Ik heb de facturen, bedragen"));
  find(label, (node) => node.type === "input").props.onChange({ target: { checked: true } });
  tree = runtime.render(input); button(tree, "Terug naar controle").props.onClick(); tree = runtime.render(input);
  assert.match(text(tree), /2024-0114/);
  find(tree, (node) => node.type === "input" && node.props["aria-label"] === "Factuur 2024-0114 meenemen").props.onChange({ target: { checked: false } });
  tree = runtime.render(input); assert.equal(button(tree, "Verder naar opslaan").props.disabled, true);
  button(tree, "Terug naar bestanden").props.onClick(); tree = runtime.render(input); assert.match(text(tree), /export.xlsx/);
});
test("bank flow advances the same mounted panel through files, review and matching without saving during navigation", () => {
  const runtime = wizard(), input = props(); let applied = 0;
  input.onReconcile = () => { applied++; return true; };
  let tree = runtime.render(input); button(tree, "Facturen met bankbetalingen").props.onClick(); tree = runtime.render(input);
  assert.equal(bankPanel(tree).props.stage, "files"); bankPanel(tree).props.onNext(); tree = runtime.render(input);
  assert.equal(bankPanel(tree).props.stage, "review"); bankPanel(tree).props.onNext(); tree = runtime.render(input);
  assert.equal(bankPanel(tree).props.stage, "matching"); assert.equal(applied, 0);
  button(tree, "Terug naar controle").props.onClick(); tree = runtime.render(input);
  assert.equal(bankPanel(tree).props.stage, "review");
  button(tree, "Werkwijze kiezen").props.onClick(); tree = runtime.render(input);
  assert.ok(bankPanel(tree, false)); assert.equal(applied, 0);
});
