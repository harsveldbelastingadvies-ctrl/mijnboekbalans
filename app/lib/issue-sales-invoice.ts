import { createHash, randomUUID } from "node:crypto";
import { prepareSalesInvoice, type InvoiceAdministration, type SalesInvoiceDraft } from "./issued-sales-invoices.ts";
import { buildSalesInvoicePdf } from "./sales-invoice-pdf.ts";
import { documentSchema } from "./document-store.ts";
import { documentFormat } from "./documents.ts";
import { workspaceRevision, writeWorkspace, type WorkspaceDatabase, type WorkspaceData } from "./workspace-store.ts";
export class SalesInvoiceIssueError extends Error {
    status: number;
    code: string;
    constructor(message: string, status = 400, code = "INVOICE_INVALID") { super(message); this.status = status; this.code = code; }
}
type Store = Omit<WorkspaceData, "administrations"> & {
    administrations: InvoiceAdministration[];
};
export async function issueStoredSalesInvoice<T extends Store>(db: WorkspaceDatabase | null, directory: string, store: T, expectedRevision: unknown, administrationId: string, draft: SalesInvoiceDraft) {
    const admin = store.administrations.find(a => a.id === administrationId);
    if (!admin)
        throw new SalesInvoiceIssueError("Administratie niet gevonden.", 404);
    if (!draft || typeof draft.id !== "string")
        throw new SalesInvoiceIssueError("Het concept heeft geen geldig kenmerk.");
    const existing = admin.issuedSalesInvoices?.find(i => i.id === draft.id);
    // Retry after a lost acknowledgement returns the same issued invoice, without another posting.
    if (existing)
        return { store, invoice: existing };
    if (typeof expectedRevision !== "string" || expectedRevision !== workspaceRevision(store))
        throw new SalesInvoiceIssueError("De administratie is gewijzigd. Open de nieuwste serverversie voordat je deze factuur uitgeeft.", 409, "REVISION_CONFLICT");
    if (!db)
        throw new SalesInvoiceIssueError("Definitieve uitgifte vereist de online database.", 503);
    if (JSON.stringify(draft).length > 300000)
        throw new SalesInvoiceIssueError("Het factuurconcept is te groot.");
    const now = new Date().toISOString();
    let prepared;
    try {
        prepared = prepareSalesInvoice(admin, draft, randomUUID(), now);
    }
    catch (e) {
        throw new SalesInvoiceIssueError((e as Error).message);
    }
    let bytes: Uint8Array;
    try {
        bytes = new Uint8Array(await buildSalesInvoicePdf(prepared.invoice).arrayBuffer());
    }
    catch (e) {
        throw new SalesInvoiceIssueError((e as Error).message);
    }
    const invoice = prepared.invoice, format = documentFormat(`factuur-${invoice.number.replace(/[^a-z0-9-]/gi, "_")}.pdf`, bytes.length, bytes), digest = createHash("sha256").update(bytes).digest("hex"), revision = randomUUID();
    const next = { ...store, revision, updatedAt: now, administrations: store.administrations.map(a => a.id !== admin.id ? a : { ...a, salesInvoiceDraft: undefined, salesInvoiceIssuer: invoice.issuer, salesInvoiceClosing: invoice.closing, issuedSalesInvoices: [invoice, ...(a.issuedSalesInvoices ?? [])], nextInvoiceNumber: prepared.nextInvoiceNumber, entries: [...prepared.entries, ...a.entries] }) } as T;
    await db.batch(documentSchema.map(sql => db.prepare(sql)));
    const guard = "EXISTS (SELECT 1 FROM workspace_store WHERE id = 'main' AND json_extract(data, '$.revision') = ?)";
    const statements = [db.prepare(`INSERT INTO administration_documents (id,administration_id,name,size,mime,category,year,created_at,digest) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(invoice.documentId, admin.id, format.name, bytes.length, format.mime, "Verkoopfacturen", admin.fiscalYear, now, digest, revision)];
    for (let offset = 0, position = 0; offset < bytes.length; offset += 128 * 1024, position++)
        statements.push(db.prepare(`INSERT INTO administration_document_parts (document_id,position,data) SELECT ?,?,? WHERE ${guard}`).bind(invoice.documentId, position, Buffer.from(bytes.subarray(offset, offset + 128 * 1024)).toString("base64"), revision));
    // Revision, history, immutable invoice, postings and PDF commit or roll back together.
    if (!await writeWorkspace(db, directory, next, expectedRevision, statements))
        throw new SalesInvoiceIssueError("Een andere sessie heeft gegevens opgeslagen. Deze factuur is niet uitgegeven; open de nieuwste serverversie.", 409, "REVISION_CONFLICT");
    return { store: next, invoice };
}
