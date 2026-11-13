"use client";

import { useMemo, useRef, useState } from "react";
import { formatDutchDate } from "../lib/dutch-date";
import { previewSpreadsheetInvoices, readInvoiceSpreadsheet, spreadsheetAccept, spreadsheetFields, suggestSpreadsheetHeader, suggestSpreadsheetMapping, type SpreadsheetEntry, type SpreadsheetMapping, type SpreadsheetSheet } from "../lib/spreadsheet-invoices";

const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const pageSize = 50;
export function SpreadsheetInvoiceImport({ administrationName, fiscalYear, existingNumbers, onBook }: {
  administrationName: string; fiscalYear: number; existingNumbers: string[];
  onBook: (entries: SpreadsheetEntry[]) => boolean;
}) {
  const [sheets, setSheets] = useState<SpreadsheetSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<SpreadsheetMapping>({});
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [defaultVatRate, setDefaultVatRate] = useState("");
  const [defaultStatus, setDefaultStatus] = useState<"open" | "paid">("open");
  const [confirmZeroVat, setConfirmZeroVat] = useState(false);
  const [allowMultipleLines, setAllowMultipleLines] = useState(false);
  const [category, setCategory] = useState("Omzet diensten");
  const [confirmed, setConfirmed] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const reading = useRef(0);
  const sheet = sheets[sheetIndex];
  const preview = useMemo(() => {
    if (!sheet) return { invoices: [], error: "" };
    try { return { invoices: previewSpreadsheetInvoices(sheet, headerRow, mapping, { fiscalYear, defaultVatRate, defaultStatus, confirmZeroVat, allowMultipleLines, category }, existingNumbers), error: "" }; }
    catch (error) { return { invoices: [], error: (error as Error).message }; }
  }, [sheet, headerRow, mapping, fiscalYear, defaultVatRate, defaultStatus, confirmZeroVat, allowMultipleLines, category, existingNumbers]);
  const valid = preview.invoices.filter((invoice) => !invoice.errors.length);
  const selected = valid.filter((invoice) => !excluded.has(invoice.key));
  const totals = selected.reduce((sum, invoice) => ({ net: sum.net + invoice.net, vat: sum.vat + invoice.vat, gross: sum.gross + invoice.gross }), { net: 0, vat: 0, gross: 0 });
  const resetReview = () => { setConfirmed(false); setExcluded(new Set()); setPage(0); setError(""); };
  const chooseSheet = (index: number, available = sheets) => {
    const header = suggestSpreadsheetHeader(available[index]);
    setSheetIndex(index); setHeaderRow(header); setMapping(suggestSpreadsheetMapping(available[index].rows[header] ?? [])); resetReview();
  };
  const clear = () => { reading.current++; setSheets([]); setFileName(""); setLoading(false); resetReview(); };

  return <section className="panel mt-6" aria-labelledby="spreadsheet-import-title">
    <div className="section-title"><div>
      <p className="eyebrow">Overstappen vanuit DigiBoox</p>
      <h3 id="spreadsheet-import-title">Verkoopfacturen uit Excel importeren</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">Kies je export (.xlsx, .xls of CSV), controleer de kolommen en bekijk de facturen vóór het boeken. Het bestand wordt lokaal gelezen, zonder AI. Bestaande boekingen worden behouden.</p>
    </div><label className={`primary-button ${loading ? "opacity-60" : ""}`}>
      {loading ? "Excel lezen…" : "Kies Excel / CSV"}
      <input aria-label="Excel-verkoopfacturen kiezen" className="sr-only" type="file" accept={spreadsheetAccept} disabled={loading} onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        const request = ++reading.current;
        setLoading(true); setError(""); setSheets([]); setFileName(""); setDefaultVatRate(""); setDefaultStatus("open"); setConfirmZeroVat(false); setAllowMultipleLines(false); resetReview();
        try {
          if (file.size > 5 * 1024 * 1024) throw new Error("Kies een bestand van maximaal 5 MB.");
          const available = await readInvoiceSpreadsheet(await file.arrayBuffer(), file.name);
          if (request !== reading.current) return;
          setSheets(available); setFileName(file.name);
          const bestIndex = available.findIndex((candidate) => {
            const columns = suggestSpreadsheetMapping(candidate.rows[suggestSpreadsheetHeader(candidate)]);
            return columns.invoiceNumber !== undefined && columns.date !== undefined;
          });
          chooseSheet(Math.max(0, bestIndex), available);
        } catch (error) { if (request === reading.current) setError((error as Error).message); }
        finally { if (request === reading.current) setLoading(false); }
      }} />
    </label></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {sheet && <>
      <p className="mt-4 text-sm"><strong>{fileName}</strong> → {administrationName} · boekjaar {fiscalYear}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">Voor Nederlandse verkoopfacturen met 21%, 9% of beoordeelde 0%-omzet. Gebruik geen export waarin het volledige factuurtotaal op iedere factuurregel wordt herhaald. Verlegde, vrijgestelde en buitenlandse omzet verwerk je afzonderlijk.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label>Werkblad<select className="input" value={sheetIndex} onChange={(event) => chooseSheet(Number(event.target.value))}>{sheets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>
        <label>Rij met kolomnamen<select className="input" value={headerRow} onChange={(event) => {
          const header = Number(event.target.value); setHeaderRow(header); setMapping(suggestSpreadsheetMapping(sheet.rows[header])); resetReview();
        }}>{sheet.rows.slice(0, 50).map((row, index) => <option key={index} value={index}>Rij {index + 1}: {row.map((cell) => cell.text).filter(Boolean).join(" · ").slice(0, 110)}</option>)}</select></label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-sm">Rijen in dit bestand<select className="input" value={allowMultipleLines ? "lines" : "invoices"} onChange={(event) => { setAllowMultipleLines(event.target.value === "lines"); resetReview(); }}><option value="invoices">Eén rij per factuur</option><option value="lines">Meerdere factuurregels per factuur</option></select></label>
        <label className="text-sm">Categorie voor deze import<select className="input" value={category} onChange={(event) => { setCategory(event.target.value); resetReview(); }}><option>Omzet diensten</option><option>Omzet producten</option><option>Abonnementen</option><option>Overige inkomsten</option></select></label>
      </div>
      <fieldset className="mt-4"><legend className="font-semibold">1 · Controleer welke kolom bij ieder veld hoort</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-3">{spreadsheetFields.map(([field, label]) => <label key={field} className="text-sm">{label}<select className="input" value={mapping[field] ?? ""} onChange={(event) => {
          setMapping((current) => ({ ...current, [field]: event.target.value === "" ? undefined : Number(event.target.value) })); resetReview();
        }}><option value="">Niet in bestand / niet gebruiken</option>{(sheet.rows[headerRow] ?? []).map((cell, index) => <option key={index} value={index}>{index + 1} · {cell.text || "Kolom zonder naam"}</option>)}</select></label>)}</div>
      </fieldset>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">Btw-tarief als een percentage ontbreekt<select className="input" value={defaultVatRate} onChange={(event) => { setDefaultVatRate(event.target.value); resetReview(); }}><option value="">Afleiden uit bedragen, anders aanvullen</option><option value="21">21%</option><option value="9">9%</option><option value="0">0% (apart beoordelen)</option></select></label>
        <label className="text-sm">Betaalstatus als betaalgegevens ontbreken<select className="input" value={defaultStatus} onChange={(event) => { setDefaultStatus(event.target.value as "paid" | "open"); resetReview(); }}><option value="open">Open</option><option value="paid">Betaald (betaaldatum verplicht)</option></select></label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmZeroVat} onChange={(event) => { setConfirmZeroVat(event.target.checked); resetReview(); }} /><span>Ik heb gecontroleerd dat eventuele 0%-regels Nederlandse 0%-omzet zijn. Verlegde, vrijgestelde en buitenlandse facturen verwerk ik afzonderlijk met de juiste btw-behandeling.</span></label>
      {preview.error && <p role="alert" className="mt-3 text-sm text-red-700">{preview.error}</p>}
      <div className="mt-5 rounded-lg border border-[var(--line)] p-4">
        <h4 className="font-semibold">2 · Controleer de facturen en totalen</h4>
        <p className="mt-2 text-sm">{preview.invoices.length} facturen · {valid.length} boekbaar · {preview.invoices.length - valid.length} met aandachtspunten · {selected.length} geselecteerd</p>
        <p className="mt-2 text-sm">Selectie: excl. btw <strong>{money.format(totals.net)}</strong> · btw <strong>{money.format(totals.vat)}</strong> · incl. btw <strong>{money.format(totals.gross)}</strong></p>
        <p className="mt-2 text-sm text-[var(--muted)]">Datums buiten het boekjaar en bestaande factuurnummers worden geblokkeerd. Facturen met fouten worden niet geboekt. Bedragen en btw uit de export blijven behouden, inclusief creditfacturen.</p>
      </div>
      {!!preview.invoices.length && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Meenemen", "Excel-rij", "Factuur", "Datum", "Klant", "Excl. btw", "Btw", "Incl. btw", "Controle"].map((label) => <th className="p-2" key={label} scope="col">{label}</th>)}</tr></thead><tbody>
        {preview.invoices.slice(page * pageSize, (page + 1) * pageSize).map((invoice) => <tr key={invoice.key} className="border-t border-[var(--line)] align-top">
          <td className="p-2"><input type="checkbox" aria-label={`Factuur ${invoice.invoiceNumber || `rij ${invoice.rows[0]}`} meenemen`} disabled={!!invoice.errors.length} checked={!invoice.errors.length && !excluded.has(invoice.key)} onChange={(event) => {
            setExcluded((current) => { const next = new Set(current); if (event.target.checked) next.delete(invoice.key); else next.add(invoice.key); return next; }); setConfirmed(false);
          }} /></td>
          <td className="p-2">{invoice.rows.join(", ")}</td><td className="p-2">{invoice.invoiceNumber || "Ontbreekt"}</td><td className="p-2 whitespace-nowrap">{formatDutchDate(invoice.date) || "Ongeldig"}</td><td className="p-2">{invoice.relation}</td>
          <td className="p-2 whitespace-nowrap">{money.format(invoice.net)}</td><td className="p-2 whitespace-nowrap">{money.format(invoice.vat)}</td><td className="p-2 whitespace-nowrap">{money.format(invoice.gross)}</td>
          <td className="min-w-64 p-2">{invoice.errors.length ? <ul className="list-inside list-disc text-red-700">{invoice.errors.map((message, index) => <li key={index}>{message}</li>)}</ul> : <><span className="font-semibold text-[var(--teal)]">Boekbaar · {invoice.status === "paid" ? "Betaald" : "Open"}</span>{[...new Set(invoice.warnings)].map((message) => <p key={message}>{message}</p>)}</>}</td>
        </tr>)}
      </tbody></table></div>}
      {preview.invoices.length > pageSize && <div className="mt-3 flex items-center gap-3"><button className="secondary-button" disabled={!page} onClick={() => setPage(page - 1)}>Vorige</button><span>Pagina {page + 1} van {Math.ceil(preview.invoices.length / pageSize)}</span><button className="secondary-button" disabled={(page + 1) * pageSize >= preview.invoices.length} onClick={() => setPage(page + 1)}>Volgende</button></div>}
      <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Ik heb de administratie, datums, btw, betaalgegevens en totalen van de {selected.length} geselecteerde facturen gecontroleerd.</span></label>
      <div className="mt-4 flex flex-wrap gap-3"><button className="primary-button" disabled={!confirmed || !selected.length || !!preview.error} onClick={() => {
        if (!confirmed || !selected.length || preview.error) return;
        if (onBook(selected.flatMap((invoice) => invoice.entries))) clear();
        else { setError("De selectie kon niet worden geboekt. Controleer de melding bovenaan en het actuele facturenoverzicht."); setConfirmed(false); }
      }}>Boek {selected.length} geselecteerde facturen</button><button className="ghost-button" onClick={clear}>Sluit Excel-voorbeeld</button></div>
    </>}
  </section>;
}
