import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import * as bank from "../app/lib/bank-reconciliation.ts";
import { formatDutchDate } from "../app/lib/dutch-date.ts";
import { spreadsheetAmount } from "../app/lib/spreadsheet-invoices.ts";

// Exercise the actual event handlers and confirmation state without real bank data or network access.
function controls(overrides = {}) {
  const states = []; let cursor = 0;
  const compiledModule = { exports: {} }, jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(readFileSync(new URL("../app/components/bank-payment-panel.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: compiledModule.exports, module: compiledModule,
    crypto: webcrypto, File, FormData, fetch: () => { throw new Error("Unexpected network call"); }, ...overrides,
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
  assert.equal(find(tree, (node) => node.type === "button" && text(node).includes("Opslaan en afronden")).props.disabled, true);
  find(tree, (node) => node.type === "button" && text(node) === "Maak koppelvoorstellen").props.onClick();
  tree = runtime.render(input);
  find(tree, (node) => node.type === "button" && text(node) === "Koppeling aanpassen").props.onClick();
  tree = runtime.render(input);
  assert.equal(find(tree, (node) => node.type === "input" && node.props["aria-label"]?.startsWith("Factuur bij betaling")).props.value, "2024-0114");
  const label = find(tree, (node) => node.type === "label" && text(node).includes("Ik heb de geselecteerde Excel-facturen"));
  find(label, (node) => node.type === "input").props.onChange({ target: { checked: true } });
  tree = runtime.render(input);
  const apply = find(tree, (node) => node.type === "button" && text(node).includes("Opslaan en afronden"));
  assert.equal(apply.props.disabled, false); apply.props.onClick(); assert.equal(applied, 1);
  find(tree, (node) => node.type === "input" && node.props["aria-label"]?.startsWith("Gekoppeld bedrag")).props.onBlur({ target: { value: "120,00" } });
  tree = runtime.render(input);
  assert.equal(find(tree, (node) => node.type === "button" && text(node).includes("Opslaan en afronden")).props.disabled, true);
  find(tree, (node) => node.type === "button" && text(node).includes("Opslaan en afronden")).props.onClick();
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
  assert.equal(find(tree, (node) => node.type === "button" && text(node).includes("Opslaan en afronden")).props.disabled, true);
});

test("stage navigation cannot save and proposals stay read-only until explicitly edited", () => {
  const runtime = controls(), input = { ...props(), stage: "files" }; let next = 0;
  input.onNext = () => next++;
  let tree = runtime.render(input);
  assert.equal(nodes(tree).some((node) => text(node) === "Opslaan en afronden"), false);
  find(tree, (node) => node.type === "button" && text(node) === "Bestanden controleren").props.onClick();
  assert.equal(next, 1);
  input.stage = "review"; tree = runtime.render(input);
  find(tree, (node) => node.type === "button" && text(node) === "Koppelingen bekijken").props.onClick();
  assert.equal(next, 2);
  input.stage = "matching"; tree = runtime.render(input);
  assert.equal(nodes(tree).some((node) => node.type === "input" && node.props["aria-label"]?.startsWith("Factuur bij betaling")), false);
  assert.equal(find(tree, (node) => node.type === "button" && text(node) === "Opslaan en afronden").props.disabled, true);
  find(tree, (node) => node.type === "button" && text(node) === "Later koppelen").props.onClick();
  tree = runtime.render(input);
  const confirmation = find(tree, (node) => node.type === "label" && text(node).includes("Ik heb de geselecteerde Excel-facturen"));
  find(confirmation, (node) => node.type === "input").props.onChange({ target: { checked: true } });
  let saved;
  input.onApply = (value) => { saved = value; return true; };
  tree = runtime.render(input);
  // Existing saved mutations need no new write when all suggestions are postponed.
  assert.equal(find(tree, (node) => node.type === "button" && text(node) === "Opslaan en afronden").props.disabled, true);
  assert.equal(saved, undefined);
  assert.equal(input.storedStatements[0].transactions[0].allocations, undefined);
});

test("retry replaces only the empty failed PDF and a successfully read PDF cannot be imported twice", async () => {
  const file = new File(["synthetic bank PDF"], "bank.pdf", { type: "application/pdf" });
  const digest = Buffer.from(await webcrypto.subtle.digest("SHA-256", await file.arrayBuffer())).toString("hex");
  let requests = 0;
  const runtime = controls({ fetch: async (_url, init) => {
    requests++;
    assert.equal(init.body.get("aiConsent"), "true");
    const statement = { ...props().storedStatements[0], id: digest, verified: false,
      transactions: requests === 1 ? [] : props().storedStatements[0].transactions };
    return Response.json({ statement, notice: requests === 1 ? "Tegoed controleren" : "Gelezen" });
  } });
  const input = { ...props(), stage: "files", storedStatements: [] };
  let tree = runtime.render(input);
  const ai = find(tree, (node) => node.type === "label" && text(node).includes("Lees de gekozen bank-PDF"));
  find(ai, (node) => node.type === "input").props.onChange({ target: { checked: true } });
  tree = runtime.render(input);
  await find(tree, (node) => node.type === "input" && node.props["aria-label"] === "Bankafschriften kiezen").props.onChange({ target: { files: [file], value: "" } });
  tree = runtime.render(input);
  assert.equal(requests, 1);
  await find(tree, (node) => node.type === "button" && text(node) === "Opnieuw lezen").props.onClick();
  tree = runtime.render(input);
  assert.equal(requests, 2);
  assert.equal(nodes(tree).filter((node) => node.type === "li").length, 1);
  assert.ok(text(tree).includes("1 transacties herkend"));
  await find(tree, (node) => node.type === "input" && node.props["aria-label"] === "Bankafschriften kiezen").props.onChange({ target: { files: [file], value: "" } });
  assert.equal(requests, 2);
  assert.ok(text(runtime.render(input)).includes("niet dubbel toegevoegd"));
});

test("postponing one of two payments removes the whole pending invoice group", () => {
  const runtime = controls(), input = { ...props(), stage: "review" };
  const transaction = input.storedStatements[0].transactions[0];
  input.storedStatements[0].transactions = [{ ...transaction, amount: 61 }, { ...transaction, id: "t2", amount: 60 }];
  let tree = runtime.render(input);
  find(tree, (node) => node.type === "button" && text(node) === "Koppelingen bekijken").props.onClick();
  input.stage = "matching"; tree = runtime.render(input);
  assert.equal(nodes(tree).filter((node) => node.type === "button" && text(node) === "Later koppelen").length, 2);
  find(tree, (node) => node.type === "button" && text(node) === "Later koppelen").props.onClick();
  tree = runtime.render(input);
  assert.equal(nodes(tree).filter((node) => node.type === "button" && text(node) === "Later koppelen").length, 0);
  assert.equal(nodes(tree).filter((node) => node.type === "button" && text(node) === "Factuur kiezen").length, 2);
  assert.equal(input.existingEntries[0].status, "open");
  assert.equal(input.storedStatements[0].transactions.length, 2);
});

test("already linked statements remain reachable for review and unlinking without another upload", () => {
  const runtime = controls(), input = { ...props(), stage: "files" };
  input.storedStatements[0].transactions[0].allocations = [{ invoiceKey: "invoice", invoiceNumber: "2024-0114", amount: 121 }];
  let tree = runtime.render(input);
  assert.equal(find(tree, (node) => node.type === "button" && text(node) === "Bestanden controleren").props.disabled, false);
  input.stage = "review"; tree = runtime.render(input);
  assert.equal(find(tree, (node) => node.type === "button" && text(node) === "Koppelingen bekijken").props.disabled, false);
  input.stage = "matching"; tree = runtime.render(input);
  find(tree, (node) => node.type === "button" && text(node) === "Ontkoppel betaling en bijbehorende facturen");
});
