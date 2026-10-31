import assert from "node:assert/strict";
import test from "node:test";
import { newFilingDossier, markFilingSubmitted } from "../app/lib/filing-workspace.ts";
const snapshot = () => ({ year:2026,period:"q3",label:"Kwartaal 3",capturedAt:"2026-10-31T10:00:00.000Z",rows:[{code:"1a",label:"Hoog",basis:1000,vat:210}],inputVat:40,balance:170,icpTotal:0,icpDifference:0,entryCount:2,entryIds:["entry1","entry2"] });
test("review snapshot is stable when underlying accounting numbers or IDs later change",()=> {
  const current=snapshot(); const dossier=newFilingDossier(current,"review1"); current.rows[0].vat=1000; current.entryIds.push("later");
  assert.equal(dossier.snapshot.rows[0].vat,210); assert.equal(dossier.snapshot.entryIds.length,2); assert.equal(dossier.status,"draft");
  const filed=markFilingSubmitted(dossier,"2026-10-31","Ontvangst 123","doc1"); dossier.snapshot.rows[0].vat=999;
  assert.equal(filed.snapshot.rows[0].vat,210); assert.equal(filed.status,"submitted"); assert.equal(filed.receiptDocumentId,"doc1");
});
test("external submission requires a valid date and reference; review alone does not count as filed",()=> {
  const dossier=newFilingDossier(snapshot(),"review1");
  assert.throws(()=>markFilingSubmitted(dossier,"2026-02-30","123"));
  assert.throws(()=>markFilingSubmitted(dossier,"2026-10-31"," "));
  assert.equal(dossier.status,"draft");
});
