import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contactKind, contactKindLabel, createContact, emptyContact, matchingContacts, toContactDraft } from "../app/lib/contacts.ts";

const privateDraft = { ...emptyContact, name: " Jan de Vries ", kind: "private", email: " jan@example.nl ", address: " Den Haag ", kvk: "12345678" };
test("private customers persist without business identifiers and retain name, address and role", () => {
  const contact = createContact(privateDraft, "p1");
  assert.deepEqual(contact, { id: "p1", name: "Jan de Vries", kind: "private", email: "jan@example.nl", address: "Den Haag", kvk: "", type: "customer" });
  const restored = JSON.parse(JSON.stringify(contact));
  assert.equal(contactKindLabel(restored), "Particulier");
  assert.deepEqual(createContact(toContactDraft(restored), restored.id), contact);
});
test("legacy contacts keep their role and business data when opened and saved", () => {
  const contact = { id: "b1", name: "Bedrijf", type: "entrepreneur", email: "", address: "Den Haag", kvk: "12345678" };
  assert.equal(contactKind(contact), "business");
  assert.deepEqual(createContact(toContactDraft(contact), contact.id), { ...contact, kind: "business" });
  assert.equal(matchingContacts([contact], " BEDRIJF ")[0].id, contact.id);
  assert.equal(matchingContacts([contact], "").length, 0);
});

const source = ts.createSourceFile("page.tsx", readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
function quickContactHarness(target = { administrationId: "a1", target: "entry", role: "customer" }) {
  const form = { relation: "Getypte naam", amount: "100,00", invoiceNumber: "2026-0008", description: "Advies", salesVat: { treatment: "nl", country: "NL" }, vatLines: [{ amount: "100,00", vatRate: "21" }], status: "open" };
  const drafts = [{ id: "d1", administrationId: "a1", documentId: "original-pdf", ...form }, { id: "d2", administrationId: "a1", ...form }, { id: "d1", administrationId: "a2", ...form }];
  const active = { id: "a1", entries: [{ id: "existing-entry", amount: 123 }], contacts: [{ id: "old-contact", name: "Bestaand", kind: "business", type: "customer", kvk: "12345678", email: "", address: "" }] };
  const state = { active, form, drafts, quick: target };
  const context = vm.createContext({
    active, quickContact: target, createContact, uid: () => "new-contact",
    updateActive: (next) => { state.active = next; },
    setEntryForm: (update) => { state.form = update(state.form); },
    setInvoiceDrafts: (update) => { state.drafts = update(state.drafts); },
    setQuickContact: (next) => { state.quick = next; },
  });
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ["selectQuickContact", "saveQuickContact"].includes(node.name.getText(source))) declarations.push(`const ${node.getText(source)};`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  vm.runInContext(ts.transpile(declarations.join("\n") + "\nglobalThis.save = saveQuickContact; globalThis.select = selectQuickContact;", { target: ts.ScriptTarget.ES2020 }), context);
  return { state, context, original: { form, drafts, active } };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
test("adding a debtor in the actual booking handler preserves all entered invoice fields and existing records", () => {
  const { state, context, original } = quickContactHarness();
  context.save(privateDraft);
  assert.deepEqual(plain(state.form), { ...original.form, relation: "Jan de Vries" });
  assert.equal(state.active.contacts[0].kind, "private");
  assert.equal(state.active.contacts[0].type, "customer");
  assert.equal(state.active.contacts[0].kvk, "");
  assert.equal(state.active.entries, original.active.entries);
  assert.equal(state.active.contacts[1], original.active.contacts[0]);
  assert.equal(state.drafts, original.drafts);
  assert.equal(state.quick, null);
});
test("adding from an imported invoice changes only that administration's target draft, retaining the original document", () => {
  const { state, context, original } = quickContactHarness({ administrationId: "a1", target: "draft", draftId: "d1", role: "customer" });
  context.save(privateDraft);
  assert.deepEqual(plain(state.drafts[0]), { ...original.drafts[0], relation: "Jan de Vries" });
  assert.equal(state.drafts[0].documentId, "original-pdf");
  assert.equal(state.drafts[1], original.drafts[1]);
  assert.equal(state.drafts[2], original.drafts[2]);
  assert.equal(state.form, original.form);
});
test("selecting an existing contact adds no duplicate; stale administration targets do not change records", () => {
  const { state, context, original } = quickContactHarness();
  context.select({ name: "Bestaand" });
  assert.equal(state.active, original.active);
  assert.equal(state.form.relation, "Bestaand");
  const stale = quickContactHarness({ administrationId: "a2", target: "entry" });
  stale.context.save(privateDraft);
  assert.equal(stale.state.active, stale.original.active);
  assert.equal(stale.state.form, stale.original.form);
});

test("the shared private form hides business controls and requires only the name", () => {
  const require = createRequire(import.meta.url);
  const compiled = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../app/components/contact-fields.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports: compiled.exports, require });
  const { ContactFields } = compiled.exports;
  const props = { value: privateDraft, onChange: () => {}, businessSearch: createElement("div", null, "BUSINESS_SEARCH_CONTROL") };
  const html = renderToStaticMarkup(createElement(ContactFields, props));
  assert.match(html, /Volledige naam/);
  assert.doesNotMatch(html, /BUSINESS_SEARCH_CONTROL|Vestigingsadres|value="12345678"/);
  assert.equal((html.match(/required=""/g) || []).length, 1);
  const business = renderToStaticMarkup(createElement(ContactFields, { ...props, value: { ...privateDraft, kind: "business" } }));
  assert.match(business, /Bedrijfsnaam/);
  assert.match(business, /BUSINESS_SEARCH_CONTROL/);
  assert.match(business, /value="12345678"/);
});

test("reusing an existing customer as supplier adds that role without a duplicate or lost data", () => {
  const { state, context, original } = quickContactHarness({ administrationId: "a1", target: "entry", role: "supplier" });
  context.select(original.active.contacts[0]);
  assert.equal(state.active.contacts.length, 1);
  assert.deepEqual(plain(state.active.contacts[0]), { ...original.active.contacts[0], type: "entrepreneur" });
  assert.equal(state.form.relation, "Bestaand");
});
