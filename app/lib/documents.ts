export const maxDocumentSize = 5 * 1024 * 1024;
export const documentCategories = ["Facturen", "Inkoopfacturen", "Verkoopfacturen", "Bank", "Aangiften", "Overeenkomsten", "Jaarstukken", "Overig"] as const;
export type DocumentCategory = typeof documentCategories[number];
export type AdministrationDocument = { id: string; administrationId: string; name: string; size: number; mime: string; category: DocumentCategory; year: number; createdAt: string; digest: string };
const formats: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", txt: "text/plain", xml: "application/xml", ubl: "application/xml" };
export const acceptedDocuments = Object.keys(formats).map((extension) => `.${extension}`).join(",");
export function documentFormat(name: string, size: number, bytes?: Uint8Array) {
  const cleanName = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180) ?? "";
  const extension = cleanName.split(".").pop()?.toLowerCase() ?? "";
  if (!cleanName || !formats[extension]) throw new Error("Gebruik PDF, JPG, PNG, WebP, DOCX, XLSX, CSV, TXT of XML/UBL.");
  if (size <= 0 || size > maxDocumentSize) throw new Error("Een document moet tussen 1 byte en 5 MB groot zijn.");
  if (bytes) {
    const signature = Array.from(bytes.slice(0, 12));
    const starts = (expected: number[]) => expected.every((value, index) => signature[index] === value);
    if (extension === "pdf" && !starts([37,80,68,70,45]) || ["jpg", "jpeg"].includes(extension) && !starts([255,216,255]) || extension === "png" && !starts([137,80,78,71,13,10,26,10]) || ["docx", "xlsx"].includes(extension) && !starts([80,75,3,4]) || extension === "webp" && (!starts([82,73,70,70]) || String.fromCharCode(...signature.slice(8,12)) !== "WEBP")) throw new Error("De bestandsinhoud past niet bij het gekozen bestandstype.");
  }
  return { name: cleanName, mime: formats[extension] };
}
export function documentYear(value: unknown) { const year = Number(value); if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error("Kies een geldig boekjaar."); return year; }
export function documentCategory(value: unknown): DocumentCategory { if (!documentCategories.includes(value as DocumentCategory)) throw new Error("Kies een geldige documentmap."); return value as DocumentCategory; }
export async function uploadAdministrationDocument(file: File, pin: string, administrationId: string, year: number, category: DocumentCategory = "Facturen") {
  documentFormat(file.name, file.size);
  const form = new FormData();
  form.set("file", file); form.set("pin", pin); form.set("administrationId", administrationId); form.set("year", String(year)); form.set("category", category);
  const response = await fetch("/api/documents", { method: "POST", body: form });
  const data = await response.json() as { document?: AdministrationDocument; error?: string };
  if (!response.ok || !data.document) throw new Error(data.error || "Document bewaren mislukt.");
  return data.document;
}
export async function downloadAdministrationDocument(pin: string, administrationId: string, id: string) {
  const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "download", pin, administrationId, id }) });
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Document ophalen mislukt."); }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const name = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name ? decodeURIComponent(name) : "document"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
