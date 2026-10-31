import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { documentCategory, documentFormat, documentYear, type AdministrationDocument } from "./documents.ts";
import type { DocumentDatabase } from "./workspace-access.ts";
const directory = () => join(process.cwd(), "data", "documents");
const columns = "id, administration_id AS administrationId, name, size, mime, category, year, created_at AS createdAt, digest";
export const documentSchema = [
  "CREATE TABLE IF NOT EXISTS administration_documents (id TEXT PRIMARY KEY, administration_id TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, category TEXT NOT NULL, year INTEGER NOT NULL, created_at TEXT NOT NULL, digest TEXT NOT NULL, UNIQUE(administration_id, year, digest))",
  "CREATE INDEX IF NOT EXISTS administration_documents_admin ON administration_documents(administration_id, id)",
  "CREATE TABLE IF NOT EXISTS administration_document_parts (document_id TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(document_id, position))",
];
export async function ensureDocumentSchema(db: DocumentDatabase) { await db.batch(documentSchema.map((sql) => db.prepare(sql))); }
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
export async function listDocuments(db: DocumentDatabase | null, admin: string, cursor = "") {
  if (db) return (await db.prepare(`SELECT ${columns} FROM administration_documents WHERE administration_id = ? AND id > ? ORDER BY id LIMIT 101`).bind(admin, cursor).all<AdministrationDocument>()).results;
  await mkdir(directory(), { recursive: true });
  const names = (await readdir(directory())).filter((name) => name.endsWith(".json"));
  const documents: AdministrationDocument[] = [];
  for (const name of names) { const row = JSON.parse(await readFile(join(directory(), name), "utf8")) as AdministrationDocument; if (row.administrationId === admin && row.id > cursor) documents.push(row); }
  return documents.sort((a,b) => a.id.localeCompare(b.id)).slice(0,101);
}
export async function findDocument(db: DocumentDatabase | null, admin: string, id: string) {
  if (!validId(id)) return null;
  if (db) return db.prepare(`SELECT ${columns} FROM administration_documents WHERE id = ? AND administration_id = ?`).bind(id, admin).first<AdministrationDocument>();
  try { const row = JSON.parse(await readFile(join(directory(), `${id}.json`), "utf8")) as AdministrationDocument; return row.administrationId === admin ? row : null; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function saveDocument(db: DocumentDatabase | null, admin: string, file: { name: string; bytes: Uint8Array }, yearValue: unknown, categoryValue: unknown) {
  const year = documentYear(yearValue); const category = documentCategory(categoryValue); const format = documentFormat(file.name, file.bytes.length, file.bytes);
  const digest = createHash("sha256").update(file.bytes).digest("hex");
  if (db) {
    const existing = await db.prepare(`SELECT ${columns} FROM administration_documents WHERE administration_id = ? AND year = ? AND digest = ?`).bind(admin, year, digest).first<AdministrationDocument>();
    if (existing) return existing;
  } else {
    let cursor = "";
    while (true) { const rows = await listDocuments(null, admin, cursor); const existing = rows.find((row) => row.year === year && row.digest === digest); if (existing) return existing; if (rows.length < 101) break; cursor = rows[99].id; }
  }
  const row: AdministrationDocument = { id: randomUUID(), administrationId: admin, ...format, size: file.bytes.length, category, year, createdAt: new Date().toISOString(), digest };
  if (db) {
    const statements = [db.prepare("INSERT INTO administration_documents (id, administration_id, name, size, mime, category, year, created_at, digest) VALUES (?,?,?,?,?,?,?,?,?)").bind(row.id, admin, row.name, row.size, row.mime, category, year, row.createdAt, digest)];
    // Bounded chunks stay well below D1's per-row limit. A batch commits atomically.
    for (let offset = 0, index = 0; offset < file.bytes.length; offset += 128 * 1024, index++) statements.push(db.prepare("INSERT INTO administration_document_parts (document_id, position, data) VALUES (?,?,?)").bind(row.id, index, Buffer.from(file.bytes.subarray(offset, offset + 128 * 1024)).toString("base64")));
    await db.batch(statements);
  } else {
    await mkdir(directory(), { recursive: true });
    await writeFile(join(directory(), `${row.id}.bin`), file.bytes);
    const temp = join(directory(), `${row.id}.tmp`); await writeFile(temp, JSON.stringify(row)); await rename(temp, join(directory(), `${row.id}.json`));
  }
  return row;
}
export async function documentBytes(db: DocumentDatabase | null, row: AdministrationDocument) {
  const bytes = db ? Buffer.concat((await db.prepare("SELECT data FROM administration_document_parts WHERE document_id = ? ORDER BY position").bind(row.id).all<{ data: string }>()).results.map((part) => Buffer.from(part.data, "base64"))) : await readFile(join(directory(), `${row.id}.bin`));
  if (bytes.length !== row.size || createHash("sha256").update(bytes).digest("hex") !== row.digest) throw new Error("Het document kon niet volledig worden gelezen. Probeer opnieuw.");
  return bytes;
}
export async function removeDocument(db: DocumentDatabase | null, row: AdministrationDocument) {
  if (db) await db.batch([db.prepare("DELETE FROM administration_document_parts WHERE document_id = ?").bind(row.id), db.prepare("DELETE FROM administration_documents WHERE id = ? AND administration_id = ?").bind(row.id, row.administrationId)]);
  else { await unlink(join(directory(), `${row.id}.json`)); await unlink(join(directory(), `${row.id}.bin`)); }
}
export async function updateDocument(db: DocumentDatabase | null, row: AdministrationDocument, categoryValue: unknown, yearValue: unknown) {
  const category = documentCategory(categoryValue); const year = documentYear(yearValue);
  if (db) await db.prepare("UPDATE administration_documents SET category = ?, year = ? WHERE id = ? AND administration_id = ?").bind(category, year, row.id, row.administrationId).run();
  else { const temp = join(directory(), `${row.id}.tmp`); await writeFile(temp, JSON.stringify({ ...row, category, year })); await rename(temp, join(directory(), `${row.id}.json`)); }
  return { ...row, category, year };
}
