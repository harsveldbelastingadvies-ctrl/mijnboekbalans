import { NextRequest, NextResponse } from "next/server";
import { authorizeDocumentAccess, getDocumentDatabase } from "../../lib/workspace-access";
import { documentBytes, ensureDocumentSchema, findDocument, listDocuments, removeDocument, saveDocument, updateDocument } from "../../lib/document-store";
import { readLimitedBody } from "../../lib/request-body";
import { maxDocumentSize } from "../../lib/documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest) {
  try {
    const isUpload = request.headers.get("content-type")?.includes("multipart/form-data");
    if (Number(request.headers.get("content-length") || 0) > maxDocumentSize + 65536) return json({ error: "Maximaal 5 MB per document." }, 413);
    const bytes = await readLimitedBody(request, isUpload ? maxDocumentSize + 65536 : 65536);
    const bounded = new Request(request.url, { method: "POST", headers: request.headers, body: bytes });
    const form = isUpload ? await bounded.formData() : null;
    const body = form ? Object.fromEntries(form.entries()) : await bounded.json();
    if (!body || typeof body.administrationId !== "string") return json({ error: "Kies een administratie." }, 400);
    const db = getDocumentDatabase();
    if (!await authorizeDocumentAccess(db, body.pin, body.administrationId)) return json({ error: "Geen toegang. Ontgrendel de werkruimte opnieuw en kies een opgeslagen administratie." }, 401);
    if (db) await ensureDocumentSchema(db);
    if (form) {
      const file = form.get("file");
      if (!(file instanceof File) || file.size > maxDocumentSize || !file.size) return json({ error: "Kies een document van maximaal 5 MB." }, 400);
      const row = await saveDocument(db, body.administrationId, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, body.year, body.category);
      return json({ document: row });
    }
    if (body.action === "list") {
      const rows = await listDocuments(db, body.administrationId, typeof body.cursor === "string" ? body.cursor : "");
      return json({ documents: rows.slice(0,100), cursor: rows.length > 100 ? rows[99].id : null });
    }
    const row = await findDocument(db, body.administrationId, String(body.id || ""));
    if (!row) return json({ error: "Document niet gevonden in deze administratie." }, 404);
    if (body.action === "download") return new NextResponse(new Uint8Array(await documentBytes(db, row)), { headers: { "Content-Type": row.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    if (body.action === "delete") { await removeDocument(db, row); return json({ ok: true }); }
    if (body.action === "update") return json({ document: await updateDocument(db, row, body.category, body.year) });
    return json({ error: "Onbekende documentactie." }, 400);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Documentopslag is tijdelijk niet beschikbaar." }, 400); }
}
