import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { salesAdmin, salesDraft } from "./helpers/sales-invoice-fixture.mjs";
import { calculateNewSalesLines, prepareSalesInvoice, issuedInvoiceChangesError } from "../app/lib/issued-sales-invoices.ts";
import { buildSalesInvoicePdf } from "../app/lib/sales-invoice-pdf.ts";
import { issueStoredSalesInvoice } from "../app/lib/issue-sales-invoice.ts";
import { readWorkspace, writeWorkspace, workspaceRevision, listWorkspaceHistory } from "../app/lib/workspace-store.ts";
import { documentBytes, findDocument } from "../app/lib/document-store.ts";
function database() {
  const sqlite = new DatabaseSync(":memory:");
  const prepare = (sql, values = []) => ({ sql, values, bind: (...next) => prepare(sql, next), first: async () => sqlite.prepare(sql).get(...values) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...values) }), run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }) });
  return { sqlite, prepare, batch: async statements => { sqlite.exec("BEGIN"); try { const results = statements.map(s => ({ meta: { changes: Number(sqlite.prepare(s.sql).run(...s.values).changes) } })); sqlite.exec("COMMIT"); return results; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
}
const baseline = () => ({ profile: {}, updatedAt: "2026-11-14T10:00:00Z", revision: "base", administrations: [salesAdmin(), { ...salesAdmin(), id: "other" }] });
test("inclusive prices round VAT once per rate and book exactly the PDF totals", () => {
  const { invoice, entries, nextInvoiceNumber } = prepareSalesInvoice(salesAdmin(), salesDraft(), "doc", "now");
  assert.equal(invoice.net, 454.55); assert.equal(invoice.vat, 95.45); assert.equal(invoice.gross, 550);
  assert.equal(entries.reduce((s,l)=>s+Math.round(l.amount*100),0),45455);
  assert.equal(entries.reduce((s,l)=>s+Math.round(l.invoiceVatAmount*100),0),9545);
  assert.equal(nextInvoiceNumber,"2026-0297"); assert.equal(entries.every(e=>e.status==="open"),true);
  const mixed = salesDraft(); mixed.prices="exclusive"; mixed.lines[0].price="100"; mixed.lines[1].price="100"; mixed.lines[1].vatRate="9";
  assert.deepEqual(calculateNewSalesLines(mixed).map(l=>[l.net,l.vat,l.gross]),[[100,21,121],[100,9,109]]);
  mixed.lines[0].quantity="1,125"; mixed.lines[0].price="10,1234";
  assert.equal(calculateNewSalesLines(mixed)[0].net,11.39);
});
test("invalid dates, amounts, identities, zero VAT and duplicate line IDs cannot issue", () => {
  for(const mutate of [d=>d.date="2025-11-14",d=>d.date="2026-02-30",d=>d.dueDate="2026-11-01",d=>d.deliveryDate="",d=>d.customerAddress="",d=>d.issuer.iban="NL00ABNA0417164300",d=>d.issuer.vatNumber="123",d=>d.lines[0].price="-5",d=>d.lines[0].vatRate="0",d=>d.lines[1].id=d.lines[0].id]) {
    const d=salesDraft();mutate(d);assert.throws(()=>prepareSalesInvoice(salesAdmin(),d,"doc","now"));
  }
});
test("concept PDFs are unmistakably marked and unsupported Unicode fails visibly", async () => {
  const {invoice}=prepareSalesInvoice(salesAdmin(),salesDraft(),"doc","now");
  const text=await buildSalesInvoicePdf(invoice,true).text();assert.match(text,/CONCEPT - NIET UITGEREIKT/);assert.match(text,/xref/);assert.match(text,/550,00/);
  assert.doesNotMatch(await buildSalesInvoicePdf(invoice).text(),/CONCEPT/);
  assert.throws(()=>buildSalesInvoicePdf({...invoice,customerName:"Customer 😀"}),/niet ondersteund/);
});
test("issuance commits invoice, entries, history and original PDF together; replay uses the original ID", async () => {
  const db=database(), old=baseline(),draft=salesDraft();await writeWorkspace(db,"unused",old,null);
  const result=await issueStoredSalesInvoice(db,"unused",old,"base","demo",draft), saved=await readWorkspace(db,"unused");
  assert.equal(saved.administrations[0].entries.length,3);assert.deepEqual(saved.administrations[1],old.administrations[1]);
  assert.equal((await listWorkspaceHistory(db,"unused")).length,1);
  const row=await findDocument(db,"demo",result.invoice.documentId),bytes=await documentBytes(db,row);
  assert.match(Buffer.from(bytes).toString(),/^%PDF/);assert.equal(await findDocument(db,"other",row.id),null);
  const replay=await issueStoredSalesInvoice(db,"unused",saved,"base","demo",{...draft,lines:[]});
  assert.deepEqual(replay.invoice,result.invoice);assert.deepEqual(await readWorkspace(db,"unused"),saved);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM administration_documents").get().n,1);
  const issued=db.sqlite.prepare("SELECT 1 AS found FROM workspace_store, json_each(data, '$.administrations') AS a, json_each(a.value, '$.issuedSalesInvoices') AS i WHERE workspace_store.id = 'main' AND json_extract(a.value, '$.id') = ? AND json_extract(i.value, '$.documentId') = ? LIMIT 1").get("demo",row.id);
  assert.equal(issued.found,1);
});
test("a stale competing issue creates no orphan PDF, no posting and consumes no number", async () => {
  const db=database(),old=baseline();await writeWorkspace(db,"unused",old,null);
  const first=await issueStoredSalesInvoice(db,"unused",old,"base","demo",salesDraft());
  const competing={...salesDraft(),id:"22345678-1234-4234-8234-123456789abc"};
  await assert.rejects(()=>issueStoredSalesInvoice(db,"unused",old,"base","demo",competing),e=>e.code==="REVISION_CONFLICT");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM administration_documents").get().n,1);
  assert.deepEqual(await readWorkspace(db,"unused"),JSON.parse(JSON.stringify(first.store)));
  const second=await issueStoredSalesInvoice(db,"unused",first.store,workspaceRevision(first.store),"demo",competing);
  assert.equal(second.invoice.number,"2026-0297");
});
test("failure writing PDF parts rolls back the invoice, number, entries and history", async () => {
  const db=database(),old=baseline();await writeWorkspace(db,"unused",old,null);
  const {documentSchema}=await import("../app/lib/document-store.ts");await db.batch(documentSchema.map(sql=>db.prepare(sql)));
  db.sqlite.exec("CREATE TRIGGER fail_pdf BEFORE INSERT ON administration_document_parts BEGIN SELECT RAISE(ABORT, 'PDF unavailable'); END");
  await assert.rejects(()=>issueStoredSalesInvoice(db,"unused",old,"base","demo",salesDraft()),/PDF unavailable/);
  assert.deepEqual(await readWorkspace(db,"unused"),old);assert.equal((await listWorkspaceHistory(db,"unused")).length,0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM administration_documents").get().n,0);
});
test("ordinary saves cannot drop issued invoices or change their financial entries; payments remain editable", () => {
  const {invoice,entries}=prepareSalesInvoice(salesAdmin(),salesDraft(),"doc","now"),old=[{...salesAdmin(),entries,issuedSalesInvoices:[invoice]}];
  assert.match(issuedInvoiceChangesError(old,[{...old[0],issuedSalesInvoices:[]}]),/niet worden verwijderd/);
  assert.match(issuedInvoiceChangesError(old,[{...old[0],entries:[]}]),/behouden/);
  assert.match(issuedInvoiceChangesError(old,[{...old[0],entries:entries.map(e=>({...e,amount:1}))}]),/behouden/);
  assert.equal(issuedInvoiceChangesError(old,[{...old[0],entries:entries.map(e=>({...e,status:"paid",paidDate:"2026-11-28"}))}]),"");
  assert.match(issuedInvoiceChangesError([{...salesAdmin(),entries:[]}],old),/definitief/);
});
