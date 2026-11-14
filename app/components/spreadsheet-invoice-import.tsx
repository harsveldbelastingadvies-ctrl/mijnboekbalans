"use client";

import { useMemo, useRef, useState } from "react";
import { formatDutchDate } from "../lib/dutch-date";
import { BankPaymentPanel, type BankReconciliationInput } from "./bank-payment-panel";
import type { BankStatement, ReconciliationEntry } from "../lib/bank-reconciliation";
import { previewSpreadsheetInvoices, readInvoiceSpreadsheet, spreadsheetAccept, spreadsheetFields, suggestSpreadsheetHeader, suggestSpreadsheetMapping, type SpreadsheetEntry, type SpreadsheetMapping, type SpreadsheetSheet } from "../lib/spreadsheet-invoices";

const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const pageSize = 50;
export function SpreadsheetInvoiceImport({ administrationName, administrationId, iban, pin, existingEntries, bankStatements, onReconcile, onUnlink, fiscalYear, existingNumbers, onBook }: {
  administrationName: string; fiscalYear: number; existingNumbers: string[];
  administrationId: string; iban: string; pin: string; existingEntries: ReconciliationEntry[]; bankStatements: BankStatement[];
  onReconcile: (rows: SpreadsheetEntry[], input: BankReconciliationInput) => boolean; onUnlink: (transactionId: string) => void;
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
  const [flow, setFlow] = useState<"bank" | "excel" | null>(null);
  const [step, setStep] = useState(1);
  const bankMode = flow === "bank";
  const [bankWasOpened, setBankWasOpened] = useState(false);
  const [confirmedSignature, setConfirmedSignature] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const reading = useRef(0);
  const sheet = sheets[sheetIndex];
  const preview = useMemo(() => {
    if (!sheet) return { invoices: [], error: "" };
    const paymentMapping = bankMode ? { ...mapping, status: undefined, paidDate: undefined, outstanding: undefined } : mapping;
    try { return { invoices: previewSpreadsheetInvoices(sheet, headerRow, paymentMapping, { fiscalYear, defaultVatRate, defaultStatus: bankMode ? "open" : defaultStatus, confirmZeroVat, allowMultipleLines, category }, existingNumbers), error: "" }; }
    catch (error) { return { invoices: [], error: (error as Error).message }; }
  }, [sheet, headerRow, mapping, fiscalYear, defaultVatRate, defaultStatus, confirmZeroVat, allowMultipleLines, category, existingNumbers, bankMode]);
  const valid = preview.invoices.filter((invoice) => !invoice.errors.length);
  const selected = valid.filter((invoice) => !excluded.has(invoice.key));
  const signature = JSON.stringify({ administrationId, fiscalYear, entries: selected.flatMap((invoice) => invoice.entries) });
  const confirmed = confirmedSignature === signature;
  const totals = selected.reduce((sum, invoice) => ({ net: sum.net + invoice.net, vat: sum.vat + invoice.vat, gross: sum.gross + invoice.gross }), { net: 0, vat: 0, gross: 0 });
  const resetReview = () => { setConfirmedSignature(""); setExcluded(new Set()); setPage(0); setError(""); };
  const chooseSheet = (index: number, available = sheets) => {
    const header = suggestSpreadsheetHeader(available[index]);
    setSheetIndex(index); setHeaderRow(header); setMapping(suggestSpreadsheetMapping(available[index].rows[header] ?? [])); resetReview();
  };
  const clear = () => { setStep(1); reading.current++; setSheets([]); setFileName(""); setLoading(false); resetReview(); };

  return <section className="panel mt-6" aria-labelledby="spreadsheet-import-title">
    <div className="section-title"><div><p className="eyebrow">Facturen en betalingen</p><h3 id="spreadsheet-import-title">Inlezen in drie stappen</h3><p className="mt-2 text-sm text-[var(--muted)]">{administrationName} · boekjaar {fiscalYear}</p></div>
      {flow && <button className="ghost-button" onClick={() => { setFlow(null); setStep(1); setConfirmedSignature(""); }}>Werkwijze kiezen</button>}
    </div>
    {!flow && <div className="mt-5 grid gap-4 md:grid-cols-2">
      <button className="rounded-xl border-2 border-[var(--teal)] bg-white p-5 text-left" onClick={() => { setFlow("bank"); setBankWasOpened(true); setStep(1); resetReview(); }}><strong className="block text-lg">Facturen met bankbetalingen</strong><span className="mt-2 block text-sm text-[var(--muted)]">Lees je Excel-export en PDF-bankafschriften samen in. Kan ook met facturen die al zijn ingeboekt.</span></button>
      <button className="rounded-xl border border-[var(--line)] bg-white p-5 text-left" onClick={() => { setFlow("excel"); setStep(1); resetReview(); }}><strong className="block text-lg">Alleen facturen uit Excel</strong><span className="mt-2 block text-sm text-[var(--muted)]">Neem factuurgegevens en eventuele betaalgegevens uit je export over.</span></button>
    </div>}
    {flow && <>
      <ol aria-label="Importstappen" className="my-5 grid grid-cols-3 gap-2">{["Bestanden", "Controleren", bankMode ? "Koppelingen" : "Opslaan"].map((label, index) => <li key={label}><button className={`w-full rounded-lg border p-3 text-left text-sm ${step === index + 1 ? "border-[var(--teal)] bg-[var(--surface)] font-semibold" : "border-[var(--line)]"}`} aria-current={step === index + 1 ? "step" : undefined} disabled={index + 1 > step} onClick={() => setStep(index + 1)}>{index + 1}. {label}</button></li>)}</ol>
      {error && <p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
      <div hidden={step !== 1}>
        <h4 className="font-semibold">{bankMode ? "Voeg je bestanden toe" : "Kies je Excel-export"}</h4>
        <p className="my-3 text-sm text-[var(--muted)]">{bankMode ? "Begin met je DigiBoox-export. Staan de facturen al in BoekBalans? Dan hoef je alleen de bankafschriften toe te voegen." : "Gebruik een .xlsx-, .xls- of CSV-bestand. Je controleert de gegevens voordat je ze opslaat."}</p>
        <label className={`primary-button ${loading ? "opacity-60" : ""}`}>
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
          if (!bankMode) setStep(2);
        } catch (error) { if (request === reading.current) setError((error as Error).message); }
        finally { if (request === reading.current) setLoading(false); }
      }} />
    </label>
        {fileName && <p className="mt-3 text-sm"><strong>{fileName}</strong> · ingelezen</p>}
        {!bankMode && <div className="mt-5"><button className="primary-button" disabled={!sheet || loading} onClick={() => setStep(2)}>Facturen controleren</button></div>}
      </div>
      <div hidden={step !== 2}>
        {sheet ? <>
          <p className="text-sm"><strong>{fileName}</strong></p>
          {preview.error && <p role="alert" className="my-3 text-sm text-red-700">{preview.error} Open hieronder de kolominstellingen.</p>}
          <details className="mt-3 rounded-lg border border-[var(--line)] p-3" open={Boolean(preview.error)}><summary className="cursor-pointer font-semibold">Kolommen en importinstellingen aanpassen</summary>
            <p className="mt-2 text-sm text-[var(--muted)]">De kolommen worden automatisch voorgesteld. Pas ze alleen aan als gegevens ontbreken of verkeerd staan. Voor Nederlandse verkoopfacturen; verlegde, vrijgestelde en buitenlandse facturen verwerk je via de gewone invoer.</p>
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
      <fieldset className="mt-4"><legend className="font-semibold">Welke kolom hoort bij ieder veld?</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-3">{spreadsheetFields.map(([field, label]) => <label key={field} className="text-sm">{label}<select className="input" disabled={bankMode && ["status", "paidDate", "outstanding"].includes(field)} value={mapping[field] ?? ""} onChange={(event) => {
          setMapping((current) => ({ ...current, [field]: event.target.value === "" ? undefined : Number(event.target.value) })); resetReview();
        }}><option value="">Niet in bestand / niet gebruiken</option>{(sheet.rows[headerRow] ?? []).map((cell, index) => <option key={index} value={index}>{index + 1} · {cell.text || "Kolom zonder naam"}</option>)}</select></label>)}</div>
      </fieldset>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">Btw-tarief als een percentage ontbreekt<select className="input" value={defaultVatRate} onChange={(event) => { setDefaultVatRate(event.target.value); resetReview(); }}><option value="">Afleiden uit bedragen, anders aanvullen</option><option value="21">21%</option><option value="9">9%</option><option value="0">0% (apart beoordelen)</option></select></label>
        <label className="text-sm">Betaalstatus als betaalgegevens ontbreken<select className="input" disabled={bankMode} value={bankMode ? "open" : defaultStatus} onChange={(event) => { setDefaultStatus(event.target.value as "paid" | "open"); resetReview(); }}><option value="open">Open</option><option value="paid">Betaald (betaaldatum verplicht)</option></select></label>
      </div>

          </details>
          {(defaultVatRate === "0" || preview.invoices.some((invoice) => invoice.entries.some((entry) => entry.vatRate === 0))) && <>      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmZeroVat} onChange={(event) => { setConfirmZeroVat(event.target.checked); resetReview(); }} /><span>Ik heb gecontroleerd dat eventuele 0%-regels Nederlandse 0%-omzet zijn. Verlegde, vrijgestelde en buitenlandse facturen verwerk ik afzonderlijk met de juiste btw-behandeling.</span></label>
</>}
                <div className="mt-5 rounded-lg border border-[var(--line)] p-4">
        <h4 className="font-semibold">Controleer je verkoopfacturen</h4>
        <p className="mt-2 text-sm">{preview.invoices.length} facturen · {valid.length} boekbaar · {preview.invoices.length - valid.length} met aandachtspunten · {selected.length} geselecteerd</p>
        <p className="mt-2 text-sm">Selectie: excl. btw <strong>{money.format(totals.net)}</strong> · btw <strong>{money.format(totals.vat)}</strong> · incl. btw <strong>{money.format(totals.gross)}</strong></p>
        <p className="mt-2 text-sm text-[var(--muted)]">Datums buiten het boekjaar en bestaande factuurnummers worden geblokkeerd. Facturen met fouten worden niet geboekt. Bedragen en btw uit de export blijven behouden, inclusief creditfacturen.</p>
      </div>
      {!!preview.invoices.length && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Meenemen", "Factuur", "Datum", "Klant", "Totaal incl. btw", "Controle"].map((label) => <th className="p-2" key={label} scope="col">{label}</th>)}</tr></thead><tbody>
        {preview.invoices.slice(page * pageSize, (page + 1) * pageSize).map((invoice) => <tr key={invoice.key} className="border-t border-[var(--line)] align-top">
          <td className="p-2"><input type="checkbox" aria-label={`Factuur ${invoice.invoiceNumber || `rij ${invoice.rows[0]}`} meenemen`} disabled={!!invoice.errors.length} checked={!invoice.errors.length && !excluded.has(invoice.key)} onChange={(event) => {
            setExcluded((current) => { const next = new Set(current); if (event.target.checked) next.delete(invoice.key); else next.add(invoice.key); return next; }); setConfirmedSignature("");
          }} /></td>
          <td className="p-2">{invoice.invoiceNumber || "Ontbreekt"}</td><td className="p-2 whitespace-nowrap">{formatDutchDate(invoice.date) || "Ongeldig"}</td><td className="p-2">{invoice.relation}</td>
          <td className="p-2 whitespace-nowrap">{money.format(invoice.gross)}<p className="text-xs text-[var(--muted)]">Btw {money.format(invoice.vat)}</p></td>
          <td className="min-w-64 p-2">{invoice.errors.length ? <ul className="list-inside list-disc text-red-700">{invoice.errors.map((message, index) => <li key={index}>{message}</li>)}</ul> : <><span className="font-semibold text-[var(--teal)]">Boekbaar · {invoice.status === "paid" ? "Betaald" : "Open"}</span></>}</td>
        </tr>)}
      </tbody></table></div>}
      {preview.invoices.length > pageSize && <div className="mt-3 flex items-center gap-3"><button className="secondary-button" disabled={!page} onClick={() => setPage(page - 1)}>Vorige</button><span>Pagina {page + 1} van {Math.ceil(preview.invoices.length / pageSize)}</span><button className="secondary-button" disabled={(page + 1) * pageSize >= preview.invoices.length} onClick={() => setPage(page + 1)}>Volgende</button></div>}

          {bankMode && <p className="mt-3 text-sm text-[var(--muted)]">De bankkoppelingen bepalen straks de betaalstatus. Facturen zonder sluitende koppeling blijven open.</p>}
          {!bankMode && <button className="primary-button mt-4" disabled={!!preview.error || !selected.length} onClick={() => setStep(3)}>Verder naar opslaan</button>}
        </> : bankMode ? <p className="text-sm">Je gebruikt de open verkoopfacturen die al in deze administratie staan.</p> : <p>Kies eerst een Excel-bestand.</p>}
        <button className="ghost-button mt-4" onClick={() => setStep(1)}>Terug naar bestanden</button>
      </div>
      {step === 3 && <div className="mt-3"><p className="text-sm"><strong>{selected.length} nieuwe facturen</strong> · totaal {money.format(totals.gross)} · {administrationName} ({fiscalYear})</p><button className="ghost-button mt-2" onClick={() => setStep(2)}>Terug naar controle</button>
        {!bankMode && <>
          <p className="my-3 text-sm text-[var(--muted)]">Je voegt de geselecteerde facturen toe. Bestaande boekingen blijven behouden.</p>
          <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmedSignature(event.target.checked ? signature : "")} /><span>Ik heb de facturen, bedragen, btw en betaalgegevens gecontroleerd.</span></label>
          <button className="primary-button mt-4" disabled={!confirmed || !selected.length || !!preview.error} onClick={() => {
            if (!confirmed || !selected.length || preview.error) return;
            if (onBook(selected.flatMap((invoice) => invoice.entries))) clear();
            else { setError("Opslaan is niet gelukt. Controleer de melding en probeer opnieuw."); setConfirmedSignature(""); }
          }}>Sla {selected.length} facturen op</button>
        </>}
      </div>}
    </>}
    {bankWasOpened && <div hidden={!bankMode || !flow}><BankPaymentPanel administrationId={administrationId} administrationName={administrationName} iban={iban} fiscalYear={fiscalYear} pin={pin} existingEntries={existingEntries} storedStatements={bankStatements} newEntries={selected.flatMap((invoice) => invoice.entries)} onUnlink={onUnlink}
      stage={step === 1 ? "files" : step === 2 ? "review" : "matching"} hasSpreadsheetFile={Boolean(sheet)} canContinue={!preview.error && (!sheet || !!selected.length)} onNext={() => setStep((current) => Math.min(3, current + 1))}
      onApply={(input) => { if (!bankMode || step !== 3 || preview.error) return false; const result = onReconcile(selected.flatMap((invoice) => invoice.entries), input); if (result) clear(); return result; }} /></div>}
  </section>;
}
