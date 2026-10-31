export type FilingSnapshot = { year: number; period: string; label: string; capturedAt: string; rows: Array<{ code: string; label: string; basis: number; vat: number }>; inputVat: number; balance: number; icpTotal: number; icpDifference: number; entryCount: number; entryIds: string[] };
export type FilingDossier = { id: string; snapshot: FilingSnapshot; status: "draft" | "submitted"; reviewedAt: string; filedDate?: string; reference?: string; receiptDocumentId?: string };
export function newFilingDossier(snapshot: FilingSnapshot, id: string): FilingDossier { return { id, snapshot: structuredClone(snapshot), status: "draft", reviewedAt: new Date().toISOString() }; }
export function markFilingSubmitted(dossier: FilingDossier, date: string, reference: string, receiptDocumentId?: string): FilingDossier {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error("Vul de datum van de externe indiening in.");
  if (!reference.trim()) throw new Error("Vul een kenmerk of bevestiging van de externe indiening in.");
  return { ...dossier, snapshot: structuredClone(dossier.snapshot), status: "submitted", filedDate: date, reference: reference.trim(), receiptDocumentId };
}
