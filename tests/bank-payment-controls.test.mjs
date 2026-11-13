import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import * as bank from "../app/lib/bank-reconciliation.ts";
import { formatDutchDate } from "../app/lib/dutch-date.ts";
import { spreadsheetAmount } from "../app/lib/spreadsheet-invoices.ts";

// Exercise the actual event handlers and confirmation state without real bank data or network access.
function controls() {
  const states = []; let cursor = 0;
  const compiledModule = { exports: {} }, jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(readFileSync(new URL("../app/components/bank-payment-panel.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: compiledModule.exports, module: compiledModule,
    require: (name) => {
      if (name === "react") return { useMemo: (fn) => fn(), useState: (initial) => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (update) => { states[index] = typeof update === "function" ? update(states[index]) : update; }]; } };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name.includes("bank-reconciliation")) return bank;
      if (name.includes("spreadsheet-invoices")) return { spreadsheetAmount };
      if (name.includes("dutch-date-input")) return { DutchDateInput: () => null };
      if (name.includes("dutch-date")) return { formatDutchDate };
      if (name.includes("documents")) return { downloadAdministrationDocument: () => { throw new Error("Unexpected network call"); } };
      throw new Error(name);
    },
  });
  return { render: (props) => { cursor = 0; return compiledModule.exports.BankPaymentPanel(props); } };
}
const nodes = (tree) => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = (tree) => typeof tree === "string" || typeof tree === "number" ? String(tree) : !tree ? "" : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
const find = (tree, predicate) => { const result = nodes(tree).find(predicate); assert.ok(result, "Control should be present"); return result; };
const props = () => ({ administrationId: "edego", administrationName: "Edego", iban: "NL00TEST", fiscalYear: 2024, pin: "example",
  existingEntries: [{ id: "invoice", type: "income", invoiceNumber: "2024-0114", date: "2024-08-01", relation: "Klant Jansen", amount: 100, vatRate: 21, description: "Werk", status: "open" }],
  storedStatements: [{ id: "s1", documentId: "doc", fileName: "bank.pdf", account: "NL00TEST", currency: "EUR", openingBalance: 0, closingBalance: 121, complete: true, verified: true, note: "", transactions: [{ id: "t1", date: "2024-08-15", amount: 121, currency: "EUR", counterparty: "Klant Jansen", description: "2024-0114", bankId: "", page: 1 }] }], newEntries: [], onApply: () => true, onUnlink: () => {},
});
test("actual bank controls require confirmation after suggestions and invalidate it when an allocation changes", () => {
  const runtime = controls(), input = props(); let applied = 0;
  input.onApply = () => { applied++; return false; };
  let tree = runtime.render(input);
  assert.equal(find(tree, (node) => node.type === "button" && text(node).includes("Facturen en bankkoppelingen verwerken")).props.disabled, true);
  find(tree, (node) => node.type === "button" && text(node) === "Maak koppelvoorstellen").props.onClick();
  tree = runtime.render(input);
  assert.equal(find(tree, (node) => node.type === "input" && node.props["aria-label"]?.startsWith("Factuur bij betaling")).props.value, "2024-0114");
  const label = find(tree, (node) => node.type === "label" && text(node).includes("Ik heb de geselecteerde Excel-facturen"));
  find(label, (node) => node.type === "input").props.onChange({ target: { checked: true } });
  tree = runtime.render(input);
  const apply = find(tree, (node) => node.type === "button" && text(node).includes("Facturen en bankkoppelingen verwerken"));
  assert.equal(apply.props.disabled, false); apply.props.onClick(); assert.equal(applied, 1);
  find(tree, (node) => node.type === "input" && node.props["aria-label"]?.startsWith("Gekoppeld bedrag")).props.onBlur({ target: { value: "120,00" } });
  tree = runtime.render(input);
  assert.equal(find(tree, (node) => node.type === "button" && text(node).includes("Facturen en bankkoppelingen verwerken")).props.disabled, true);
  find(tree, (node) => node.type === "button" && text(node).includes("Facturen en bankkoppelingen verwerken")).props.onClick();
  assert.equal(applied, 1);
});
test("AI is opt-in and confirmation becomes stale when the active invoice data changes", () => {
  const runtime = controls(), input = props(); let tree = runtime.render(input);
  const ai = find(tree, (node) => node.type === "label" && text(node).includes("Lees de gekozen bank-PDF"));
  assert.equal(find(ai, (node) => node.type === "input").props.checked, false);
  find(tree, (node) => node.type === "button" && text(node) === "Maak koppelvoorstellen").props.onClick();
  tree = runtime.render(input);
  const confirmation = find(tree, (node) => node.type === "label" && text(node).includes("Ik heb de geselecteerde Excel-facturen"));
  find(confirmation, (node) => node.type === "input").props.onChange({ target: { checked: true } });
  input.existingEntries = [{ ...input.existingEntries[0], amount: 200 }];
  tree = runtime.render(input);
  assert.equal(find(tree, (node) => node.type === "button" && text(node).includes("Facturen en bankkoppelingen verwerken")).props.disabled, true);
});
