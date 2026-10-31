import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { documentFormat, maxDocumentSize, documentYear } from "../app/lib/documents.ts";
import { hasAdministrationAccess, authorizeDocumentAccess } from "../app/lib/workspace-access.ts";
import { ensureDocumentSchema, saveDocument, listDocuments, findDocument, documentBytes, updateDocument, removeDocument } from "../app/lib/document-store.ts";
function database() {
  const sqlite = new DatabaseSync(":memory:");
  const prepare = (sql, values = []) => ({ sql, values, bind: (...next) => prepare(sql,next), first: async () => sqlite.prepare(sql).get(...values) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...values) }), run: async () => sqlite.prepare(sql).run(...values) });
  return { sqlite, prepare, batch: async (statements) => { sqlite.exec("BEGIN"); try { const rows = statements.map((statement) => sqlite.prepare(statement.sql).run(...statement.values)); sqlite.exec("COMMIT"); return rows; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
}

test("workspace PIN and administration membership are required together", async () => {
  const store = { profile: { pinHash: createHash("sha256").update("123456").digest("hex") }, administrations: [{ id: "client-a" }] };
  assert.equal(hasAdministrationAccess(store,"123456","client-a"),true);
  assert.equal(hasAdministrationAccess(store,"999999","client-a"),false);
  assert.equal(hasAdministrationAccess(store,"123456","client-b"),false);
  assert.equal(hasAdministrationAccess(null,"123456","client-a"),false);
  assert.equal(hasAdministrationAccess(store,{},"client-a"),false);
  const db=database(); db.sqlite.exec("CREATE TABLE workspace_store (id TEXT, data TEXT)"); db.sqlite.prepare("INSERT INTO workspace_store VALUES (?,?)").run("main",JSON.stringify(store));
  assert.equal(await authorizeDocumentAccess(db,"123456","client-a"),true);
  assert.equal(await authorizeDocumentAccess(db,"123456","client-b"),false);
});

test("file checks reject active/unsupported files, invalid size and false PDF headers", () => {
  assert.throws(() => documentFormat("file.svg",10));
  assert.throws(() => documentFormat("file.pdf",maxDocumentSize+1));
  assert.throws(() => documentFormat("file.pdf",0));
  assert.throws(() => documentFormat("file.pdf",10,new TextEncoder().encode("not a pdf")));
  assert.equal(documentFormat("../../factuur.pdf",10,new TextEncoder().encode("%PDF-1.7\n")).name,"factuur.pdf");
  assert.throws(() => documentYear("invalid"));
});

test("document bytes persist in bounded database chunks, stay isolated and survive metadata updates", async () => {
  const db=database(); await ensureDocumentSchema(db);
  const bytes=new Uint8Array(2200000); bytes.set(new TextEncoder().encode("%PDF-1.7\n")); bytes[2199999]=123;
  const row=await saveDocument(db,"client-a",{ name:"factuur.pdf",bytes },2026,"Inkoopfacturen");
  assert.equal((await listDocuments(db,"client-a")).length,1);
  assert.equal((await listDocuments(db,"client-b")).length,0);
  assert.equal(await findDocument(db,"client-b",row.id),null);
  assert.equal(await findDocument(db,"client-a","../../etc/passwd"),null);
  assert.deepEqual(new Uint8Array(await documentBytes(db,row)),bytes);
  assert.ok(db.sqlite.prepare("SELECT MAX(length(data)) AS size FROM administration_document_parts").get().size < 200000);
  const changed=await updateDocument(db,row,"Jaarstukken",2025);
  assert.equal((await findDocument(db,"client-a",row.id)).year,2025);
  assert.deepEqual(new Uint8Array(await documentBytes(db,changed)),bytes);
  await removeDocument(db,changed);
  assert.equal(await findDocument(db,"client-a",row.id),null);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM administration_document_parts").get().n,0);
});

test("identical upload deduplicates within one administration/year, never across clients", async () => {
  const db=database(); await ensureDocumentSchema(db); const file={ name:"document.txt",bytes:new TextEncoder().encode("Documentgegevens") };
  const a=await saveDocument(db,"a",file,2026,"Overig"); const duplicate=await saveDocument(db,"a",file,2026,"Facturen");
  assert.equal(a.id,duplicate.id);
  assert.notEqual(a.id,(await saveDocument(db,"b",file,2026,"Overig")).id);
  assert.notEqual(a.id,(await saveDocument(db,"a",file,2025,"Overig")).id);
});

test("missing or corrupt file chunks are detected instead of returning a truncated download", async () => {
  const db=database(); await ensureDocumentSchema(db); const row=await saveDocument(db,"a",{ name:"file.txt",bytes:new TextEncoder().encode("Correcte inhoud") },2026,"Overig");
  db.sqlite.prepare("UPDATE administration_document_parts SET data = ? WHERE document_id = ?").run("Yg==",row.id);
  await assert.rejects(() => documentBytes(db,row),/niet volledig/);
});

test("streamed request size is enforced even without a content-length header", async () => {
  const { readLimitedBody } = await import("../app/lib/request-body.ts");
  const source = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); controller.close(); } });
  await assert.rejects(() => readLimitedBody(new Request("https://example.test", { method: "POST", body: source, duplex: "half" }), 10), /te groot/);
  assert.equal((await readLimitedBody(new Request("https://example.test", { method: "POST", body: "hello" }), 10)).byteLength, 5);
});
