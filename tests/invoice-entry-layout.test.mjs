import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { invoiceFixture } from "./helpers/invoice-entry-fixture.mjs";

const nodes = (tree) => !tree || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
test("sales and purchase entry use the real form and a read-only summary without saving during render", () => {
  for (const type of ["income", "expense"]) {
    const h = invoiceFixture(type), tree = h.render(), html = renderToStaticMarkup(tree);
    assert.match(html, type === "income" ? /Verkoopfactuur inboeken/ : /Inkoopfactuur inboeken/);
    assert.match(html, /Jouw boeking/); assert.match(html, /121,00/); assert.match(html, /Factuurregels/); assert.match(html, /<textarea/);
    assert.match(html, type === "income" ? /Debiteur toevoegen/ : /Leverancier toevoegen/);
    if (type === "expense") { assert.match(html, /Btw-tijdvak/); assert.match(html, /Privé betaald en werkkostenregeling/); }
    assert.equal(h.submissions(), 0);
    const textarea = nodes(tree).find(n => n.type === "textarea");
    textarea.props.onChange({ target: { value: "Nieuwe omschrijving\nTweede regel" } });
    assert.equal(h.context.entryForm.description, "Nieuwe omschrijving\nTweede regel");
    const form = nodes(tree).find(n => n.type === "form"); form.props.onSubmit({ preventDefault() {} }); assert.equal(h.submissions(), 1);
  }
});
test("split VAT, editing and special purchase payment controls remain available", () => {
  const split = invoiceFixture("income", true); let html = renderToStaticMarkup(split.render());
  assert.match(html, /175,50/); assert.match(html, /2 factuurregels/); assert.equal((html.match(/Verwijder/g) || []).length, 2);
  assert.doesNotMatch(html, /class="invoice-amount-grid"/);
  const purchase = invoiceFixture("expense"); purchase.context.entryForm.paymentMethod = "dga"; purchase.context.entryForm.rcDga = "Voorbeeld DGA";
  purchase.context.entryForm.wkrType = "free"; purchase.context.activeSalaries = []; purchase.context.editingEntryId = "entry-1";
  html = renderToStaticMarkup(purchase.render()); assert.match(html, /Wijziging opslaan/); assert.match(html, /Naam DGA/); assert.match(html, /Fiscale WKR-waarde/); assert.match(html, /<details[^>]*open/);
});

test("reverse-charge purchase preview separates supplier total from self-assessed VAT", () => {
  const fixture=invoiceFixture("expense");
  fixture.context.entryForm.purchaseVat="nl_reverse";
  fixture.context.entryForm.amountInclVat="100,00";
  fixture.context.entryTaxVat=21;
  const html=renderToStaticMarkup(fixture.render());
  assert.match(html,/Btw verlegd naar mijn cliënt/);
  assert.match(html,/Rekentarief verlegde btw/);
  assert.match(html,/Zelf aangegeven btw \(2a\)/);
  assert.match(html,/Aftrekbare voorbelasting \(5b\)/);
  assert.match(html,/€(?: |&#xA0;|&#160;|\s)100,00/);
  assert.doesNotMatch(html,/€(?: |&#xA0;|&#160;|\s)121,00/);
});
