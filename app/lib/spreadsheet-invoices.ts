/** Excel exports are read locally. No macros, formulas or external links are executed. */
export type SpreadsheetCell = { value: string | number | boolean | null; text: string };
export type SpreadsheetSheet = { name: string; rows: SpreadsheetCell[][]; date1904: boolean };
export const spreadsheetFields = [
  ["invoiceNumber", "Factuurnummer"], ["date", "Factuurdatum"], ["relation", "Klant / debiteur"],
  ["description", "Omschrijving"], ["amount", "Bedrag excl. btw"], ["vatAmount", "Btw-bedrag"],
  ["grossAmount", "Bedrag incl. btw"], ["vatRate", "Btw-percentage"], ["status", "Betaalstatus"],
  ["paidDate", "Betaaldatum"], ["outstanding", "Openstaand bedrag"],
] as const;
export type SpreadsheetField = typeof spreadsheetFields[number][0];
export type SpreadsheetMapping = Partial<Record<SpreadsheetField, number>>;
export type SpreadsheetOptions = { fiscalYear: number; defaultVatRate: string; defaultStatus: "open" | "paid"; confirmZeroVat: boolean; allowMultipleLines?: boolean; category?: string };
export type SpreadsheetEntry = {
  date: string; invoiceNumber: string; relation: string; description: string; category: string;
  type: "income"; amount: number; vatRate: number; invoiceVatAmount: number; status: "paid" | "open"; paidDate?: string;
};
export type SpreadsheetInvoice = {
  key: string; rows: number[]; invoiceNumber: string; date: string; relation: string;
  net: number; vat: number; gross: number; status: "paid" | "open";
  entries: SpreadsheetEntry[]; errors: string[]; warnings: string[];
};
export const maxSpreadsheetRows = 10000;
export const spreadsheetAccept = ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/%/g, "percentage").replace(/[^a-z0-9]/g, "");
export const spreadsheetInvoiceKey = (number: string) => number.trim().toLocaleLowerCase("nl-NL");
const aliases: Record<SpreadsheetField, string[]> = {
  invoiceNumber: ["factuurnummer", "factuurnr", "factuurnr.", "factuur", "invoice number", "invoice no", "nummer"],
  date: ["factuurdatum", "datum", "invoice date", "date"],
  relation: ["relatie", "relatienaam", "debiteur", "debiteurnaam", "klant", "klantnaam", "bedrijfsnaam", "customer", "customer name"],
  description: ["omschrijving", "beschrijving", "onderwerp", "description"],
  amount: ["bedrag excl btw", "bedrag exclusief btw", "excl btw", "exclusief btw", "totaal excl btw", "totaal exclusief btw", "bedrag excl", "netto", "net amount", "subtotal"],
  vatAmount: ["btw bedrag", "btw", "totaal btw", "vat amount", "vat"],
  grossAmount: ["bedrag incl btw", "bedrag inclusief btw", "incl btw", "inclusief btw", "totaal incl btw", "totaal inclusief btw", "factuurbedrag", "totaalbedrag", "gross amount", "total amount"],
  vatRate: ["btw percentage", "btw tarief", "btw %", "btwpercentage", "tarief", "vat rate", "tax rate"],
  status: ["status", "betaalstatus", "huidige status", "payment status", "betaald"],
  paidDate: ["betaaldatum", "betaald op", "datum betaling", "payment date", "paid date"],
  outstanding: ["openstaand", "openstaand bedrag", "restant", "restbedrag", "saldo openstaand", "outstanding", "amount due"],
};
export function suggestSpreadsheetMapping(row: SpreadsheetCell[]): SpreadsheetMapping {
  const mapping: SpreadsheetMapping = {};
  for (const [field] of spreadsheetFields) {
    const matches = row.flatMap((cell, index) => aliases[field].some((alias) => normalize(alias) === normalize(cell.text)) ? [index] : []);
    if (matches.length === 1) mapping[field] = matches[0];
  }
  return mapping;
}
export function suggestSpreadsheetHeader(sheet: SpreadsheetSheet) {
  let best = 0, score = -1;
  sheet.rows.slice(0, 50).forEach((row, index) => {
    const mapping = suggestSpreadsheetMapping(row);
    const next = Object.keys(mapping).length + (mapping.invoiceNumber !== undefined ? 3 : 0) + (mapping.date !== undefined ? 3 : 0);
    if (next > score) { best = index; score = next; }
  });
  return best;
}
export async function readInvoiceSpreadsheet(bytes: ArrayBuffer, fileName: string): Promise<SpreadsheetSheet[]> {
  if (!/\.(xlsx|xls|csv)$/i.test(fileName)) throw new Error("Kies een Excel-bestand (.xlsx of .xls) of een CSV-export.");
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw new Error("Kies een bestand van maximaal 5 MB.");
  const XLSX = await import("xlsx");
  let workbook;
  if (/\.xlsx$/i.test(fileName) && (new Uint8Array(bytes)[0] !== 80 || new Uint8Array(bytes)[1] !== 75)) throw new Error("Dit is geen geldig .xlsx-bestand. Exporteer het opnieuw vanuit Excel of DigiBoox.");
  try { workbook = XLSX.read(bytes, { type: "array", raw: true, cellDates: false, cellFormula: false, sheetRows: maxSpreadsheetRows + 52 }); }
  catch { throw new Error("Dit bestand kan niet worden gelezen. Exporteer het opnieuw als .xlsx, .xls of CSV zonder wachtwoord."); }
  const sheets = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(worksheet["!fullref"] || worksheet["!ref"] || "A1");
    if (range.e.r > maxSpreadsheetRows + 50 || range.e.c > 199) throw new Error("Gebruik maximaal 10.000 factuurregels en 200 kolommen per werkblad. Splits een grotere export op.");
    const rows: SpreadsheetCell[][] = [];
    for (let r = 0; r <= range.e.r; r++) {
      const row: SpreadsheetCell[] = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
        const value = cell && ["s", "n", "b", "str"].includes(cell.t) ? cell.v as string | number | boolean : null;
        row.push({ value, text: cell ? XLSX.utils.format_cell(cell) : "" });
      }
      rows.push(row);
    }
    return { name, rows, date1904: Boolean(workbook.Workbook?.WBProps?.date1904) };
  }).filter((sheet) => sheet.rows.some((row) => row.some((cell) => cell.value !== null)));
  if (!sheets.length) throw new Error("Er staan geen gegevens in dit bestand.");
  return sheets;
}
export function spreadsheetAmount(value: SpreadsheetCell["value"]): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6 ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  let text = value.trim().replace(/(?:EUR|€|\s|\u00a0)/gi, "");
  if (/^\(.*\)$/.test(text)) text = `-${text.slice(1, -1)}`;
  if (text.endsWith("-")) text = `-${text.slice(0, -1)}`;
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (text.includes(",")) text = text.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return undefined;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : undefined;
}
export function spreadsheetDate(value: SpreadsheetCell["value"], date1904 = false): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || (!date1904 && Math.floor(value) === 60)) return "";
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, value < 60 ? 31 : 30);
    const date = new Date(epoch + Math.floor(value) * 86400000);
    return date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 2200 ? date.toISOString().slice(0, 10) : "";
  }
  if (typeof value !== "string") return "";
  const text = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]00:00(?::00)?)?$/.exec(text);
  const dutchMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  const parts = isoMatch ? [isoMatch[1], isoMatch[2], isoMatch[3]] : dutchMatch ? [dutchMatch[3], dutchMatch[2], dutchMatch[1]] : null;
  if (!parts) return "";
  const iso = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso && Number(parts[0]) >= 1900 && Number(parts[0]) <= 2200 ? iso : "";
}
const cents = (value: number) => Math.round((value + Math.sign(value) * 1e-8) * 100);
const round = (value: number) => cents(value) / 100;
export function previewSpreadsheetInvoices(sheet: SpreadsheetSheet, headerRow: number, mapping: SpreadsheetMapping, options: SpreadsheetOptions, existingNumbers: string[]): SpreadsheetInvoice[] {
  const existing = new Set(existingNumbers.map(spreadsheetInvoiceKey));
  const invoices = new Map<string, SpreadsheetInvoice>();
  const usedColumns = Object.values(mapping).filter((column) => column !== undefined);
  if (new Set(usedColumns).size !== usedColumns.length) throw new Error("Koppel iedere kolom aan maximaal één veld.");
  if (mapping.invoiceNumber === undefined || mapping.date === undefined || [mapping.amount, mapping.grossAmount].every((column) => column === undefined)) throw new Error("Koppel factuurnummer, factuurdatum en een bedragkolom.");
  if (sheet.rows.length - headerRow - 1 > maxSpreadsheetRows) throw new Error("Importeer maximaal 10.000 factuurregels tegelijk.");
  const fingerprints = new Set<string>();
  sheet.rows.slice(headerRow + 1).forEach((row, rowOffset) => {
    if (row.every((cell) => cell.value === null || cell.text.trim() === "")) return;
    const sourceRow = headerRow + rowOffset + 2;
    const cell = (field: SpreadsheetField) => mapping[field] === undefined ? undefined : row[mapping[field]!];
    const text = (field: SpreadsheetField) => cell(field)?.text.trim() ?? "";
    const raw = (field: SpreadsheetField) => cell(field)?.value ?? null;
    const invoiceNumber = text("invoiceNumber");
    // Only explicit summary rows are skipped; malformed invoice rows remain visible as errors.
    if (/^(?:eind)?totaal(?:\s|$)|^total(?:\s|$)/i.test(invoiceNumber) && !text("date")) return;
    const key = invoiceNumber ? spreadsheetInvoiceKey(invoiceNumber) : `missing-row-${sourceRow}`;
    const date = spreadsheetDate(raw("date"), sheet.date1904);
    const relation = text("relation");
    const description = text("description") || `Verkoopfactuur ${invoiceNumber}`;
    const errors: string[] = [], warnings: string[] = [];
    if (!invoiceNumber) errors.push("Factuurnummer ontbreekt.");
    if (!date) errors.push("Factuurdatum ontbreekt of is ongeldig.");
    else if (Number(date.slice(0, 4)) !== options.fiscalYear) errors.push(`Factuurdatum valt buiten boekjaar ${options.fiscalYear}.`);
    if (!relation) errors.push("Klant / debiteur ontbreekt.");
    if (existing.has(key)) errors.push("Dit verkoopfactuurnummer bestaat al in deze administratie; de bestaande boeking blijft behouden.");
    let net = spreadsheetAmount(raw("amount"));
    let vat = spreadsheetAmount(raw("vatAmount"));
    let gross = spreadsheetAmount(raw("grossAmount"));
    for (const field of ["amount", "vatAmount", "grossAmount", "outstanding"] as const) if (text(field) && spreadsheetAmount(raw(field)) === undefined) errors.push(`${spreadsheetFields.find(([name]) => name === field)![1]} is geen geldig bedrag.`);
    const rateInput = raw("vatRate");
    const rateText = typeof rateInput === "number" ? rateInput : typeof rateInput === "string" ? Number(rateInput.replace(/[%\s]/g, "").replace(",", ".")) : NaN;
    let rate = text("vatRate") ? Number(rateText) : options.defaultVatRate ? Number(options.defaultVatRate) : NaN;
    if (rate > 0 && rate < 1) rate *= 100;
    if (net === undefined && gross !== undefined && vat !== undefined) net = round(gross - vat);
    if (vat === undefined && net !== undefined && gross !== undefined) vat = round(gross - net);
    if (!Number.isFinite(rate) && net !== undefined && vat !== undefined && net !== 0) {
      const matches = [0, 9, 21].filter((candidate) => Math.abs(cents(net! * candidate / 100) - cents(vat!)) <= 1);
      if (matches.length === 1) rate = matches[0];
    }
    if (![0, 9, 21].includes(rate)) errors.push("Btw-tarief ontbreekt of is niet eenduidig. Koppel de btw-percentagekolom of kies een tarief. Splits gemengde tarieven in afzonderlijke regels met hetzelfde factuurnummer.");
    if (net === undefined && gross !== undefined && [0, 9, 21].includes(rate)) net = round(gross / (1 + rate / 100));
    if (vat === undefined && net !== undefined && [0, 9, 21].includes(rate)) vat = round(net * rate / 100);
    if (gross === undefined && net !== undefined && vat !== undefined) gross = round(net + vat);
    if (net === undefined || net === 0 || vat === undefined || gross === undefined) errors.push("Vul een geldig factuurbedrag in; nulregels kunnen niet worden geboekt.");
    if (net !== undefined && vat !== undefined && gross !== undefined && cents(net) + cents(vat) !== cents(gross)) errors.push("Exclusief btw + btw sluit niet aan op het factuurtotaal.");
    if (net !== undefined && vat !== undefined && [0, 9, 21].includes(rate) && Math.abs(cents(net * rate / 100) - cents(vat)) > 2) errors.push("Btw-bedrag sluit niet aan op het tarief. Controleer of de factuur meerdere btw-tarieven heeft.");
    if (net !== undefined && vat !== undefined && net * vat < 0) errors.push("Het teken van de btw wijkt af van het factuurbedrag. Gebruik bij creditfacturen ook negatieve btw.");
    if (rate === 0 && !options.confirmZeroVat) errors.push("Beoordeel de 0%-omzet: bevestig hieronder alleen Nederlandse 0%-omzet. Verlegde, vrijgestelde en buitenlandse facturen voer je afzonderlijk met de juiste btw-behandeling in.");
    const statusText = normalize(text("status"));
    const paidDate = spreadsheetDate(raw("paidDate"), sheet.date1904);
    if (text("paidDate") && !paidDate) errors.push("Betaaldatum is ongeldig.");
    let status: "paid" | "open" = paidDate ? "paid" : options.defaultStatus;
    const outstanding = spreadsheetAmount(raw("outstanding"));
    if (statusText) {
      if (["betaald", "voldaan", "paid", "ja", "true", "1"].includes(statusText)) status = "paid";
      else if (["open", "openstaand", "onbetaald", "unpaid", "nee", "false", "0", "verzonden", "vervallen", "overdue"].includes(statusText) || /dagen.*laat/.test(statusText)) status = "open";
      else errors.push("Betaalstatus wordt niet herkend (gebruik Betaald of Open). Concepten en gedeeltelijke betalingen kunnen niet worden geïmporteerd.");
    } else if (outstanding !== undefined && gross !== undefined) {
      if (cents(outstanding) === 0) status = "paid";
      else if (cents(outstanding) === cents(gross)) status = "open";
      else errors.push("Gedeeltelijke betaling: verwerk deze factuur afzonderlijk.");
    } else if (!paidDate) warnings.push(`Geen betaalstatus in de export; overgenomen als ${status === "open" ? "open" : "betaald"}.`);
    if (outstanding !== undefined && gross !== undefined && (status === "paid" ? cents(outstanding) !== 0 : cents(outstanding) !== cents(gross))) errors.push("Betaalstatus en openstaand bedrag spreken elkaar tegen of bevatten een deelbetaling.");
    if (status === "paid" && !paidDate) errors.push("Betaaldatum ontbreekt. Koppel de betaaldatum of verwerk de betaling afzonderlijk; er wordt geen datum verzonnen.");
    if (status === "open" && paidDate) errors.push("Open factuur heeft een betaaldatum. Controleer de betaalgegevens.");
    const fingerprint = JSON.stringify([key, date, relation, description, net, vat, gross, rate, status, paidDate]);
    if (fingerprints.has(fingerprint)) errors.push("Identieke regel staat meermaals in het bestand; verwijder de dubbele regel of controleer de factuurregels.");
    fingerprints.add(fingerprint);
    const previous = invoices.get(key);
    if (previous && !options.allowMultipleLines) errors.push("Factuurnummer staat op meerdere rijen. Kies alleen 'Meerdere factuurregels per factuur' als iedere rij een afzonderlijk regelbedrag bevat.");
    if (previous && (previous.date !== date || previous.relation !== relation || previous.status !== status || previous.entries[0]?.paidDate !== (status === "paid" ? paidDate || undefined : undefined))) errors.push("Regels met hetzelfde factuurnummer hebben verschillende datums, klanten of betaalgegevens.");
    const invoice: SpreadsheetInvoice = previous ?? { key, rows: [], invoiceNumber, date, relation, net: 0, vat: 0, gross: 0, status, entries: [], errors: [], warnings: [] };
    invoice.rows.push(sourceRow);
    invoice.errors.push(...errors.map((error) => `Rij ${sourceRow}: ${error}`));
    invoice.warnings.push(...warnings);
    invoice.net = round(invoice.net + (net ?? 0)); invoice.vat = round(invoice.vat + (vat ?? 0)); invoice.gross = round(invoice.gross + (gross ?? 0));
    invoice.entries.push({ type: "income", invoiceNumber, date, relation, description, category: options.category || "Omzet diensten", amount: net ?? 0, invoiceVatAmount: vat ?? 0, vatRate: rate, status, paidDate: status === "paid" ? paidDate || undefined : undefined });
    invoices.set(key, invoice);
  });
  return [...invoices.values()];
}
