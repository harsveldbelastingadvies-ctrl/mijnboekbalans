"use client";

import { useMemo, useState } from "react";
import { DutchDateInput } from "./dutch-date-input";
import { formatDutchDate } from "../lib/dutch-date";
import { downloadAdministrationDocument } from "../lib/documents";
import { spreadsheetAmount, type SpreadsheetEntry } from "../lib/spreadsheet-invoices";
import { bankOverlapErrors, bankStatementErrors, bankTransactionErrors, normalizeBankAccount, paymentInvoices, proposeBankAllocations, validateBankAllocations, type BankAllocation, type BankStatement, type BankTransaction, type ReconciliationEntry } from "../lib/bank-reconciliation";

export type BankReconciliationInput = { statements: BankStatement[]; allocations: BankAllocation[]; acceptedSimilarIds: string[] };
const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const decimal = (value: number | null) => value === null ? "" : value.toFixed(2).replace(".", ",");

function StatementReview({ statement, onChange, onRemove, onDownload }: { statement: BankStatement; onChange: (next: BankStatement) => void; onRemove: () => void; onDownload: () => void }) {
  const [page, setPage] = useState(0);
  const errors = bankStatementErrors(statement);
  const change = (next: BankStatement) => onChange({ ...next, verified: false });
  const updateTransaction = (id: string, fields: Partial<BankTransaction>) => change({ ...statement, transactions: statement.transactions.map((row) => row.id === id ? { ...row, ...fields } : row) });
  return <article className="mt-4 rounded-lg border border-[var(--line)] bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">{statement.fileName}</h4><div className="flex gap-2"><button className="secondary-button" onClick={onDownload}>Download bron-PDF</button><button className="ghost-button" onClick={onRemove}>Uit deze controle halen</button></div></div>
    <p className="mt-2 text-sm text-[var(--muted)]">{statement.note} {!statement.complete && "De herkenning is niet volledig: vul de transacties aan vanuit de PDF."}</p>
    <div className="mt-3 grid gap-3 md:grid-cols-4">
      <label className="text-sm">Eigen rekening / IBAN<input className="input" value={statement.account} onChange={(event) => change({ ...statement, account: normalizeBankAccount(event.target.value) })} /></label>
      <label className="text-sm">Valuta<input className="input" value={statement.currency} onChange={(event) => change({ ...statement, currency: event.target.value.toUpperCase() })} /></label>
      <label className="text-sm">Beginsaldo (leeg als onbekend)<input className="input" inputMode="decimal" defaultValue={decimal(statement.openingBalance)} onBlur={(event) => change({ ...statement, openingBalance: spreadsheetAmount(event.target.value) ?? null })} /></label>
      <label className="text-sm">Eindsaldo (leeg als onbekend)<input className="input" inputMode="decimal" defaultValue={decimal(statement.closingBalance)} onBlur={(event) => change({ ...statement, closingBalance: spreadsheetAmount(event.target.value) ?? null })} /></label>
    </div>
    <p className="mt-3 text-sm">{statement.transactions.length} transacties · saldo mutaties {money.format(statement.transactions.reduce((sum, row) => sum + (row.amount ?? 0), 0))}. Neem alle bij- én afschrijvingen over, ook zonder verkoopfactuur. Positief = bij, negatief = af.</p>
    {(statement.openingBalance === null || statement.closingBalance === null) && <p className="mt-2 text-sm text-amber-800">Begin- of eindsaldo ontbreekt. Er kan geen sluitende saldocontrole worden gedaan; controleer alle transacties met de PDF.</p>}
    <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Pagina", "Bankdatum", "Bedrag", "Valuta", "Tegenpartij", "Omschrijving / kenmerk", "Unieke bank-ID", "Controle"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{statement.transactions.slice(page * 25, (page + 1) * 25).map((row) => <tr key={row.id} className="border-t border-[var(--line)] align-top">
      <td className="p-2"><input aria-label={`Bronpagina ${formatDutchDate(row.date)} ${row.counterparty}`} className="input min-w-20" type="number" min="1" value={row.page || ""} onChange={(event) => updateTransaction(row.id, { page: Number(event.target.value) })} /></td>
      <td className="p-2"><DutchDateInput aria-label={`Bankdatum ${formatDutchDate(row.date)} ${row.counterparty}`} className="input min-w-36" value={row.date} onChange={(event) => updateTransaction(row.id, { date: event.target.value })} /></td>
      <td className="p-2"><input aria-label={`Bankbedrag ${formatDutchDate(row.date)} ${row.counterparty}`} className="input min-w-32" inputMode="decimal" defaultValue={decimal(row.amount)} onBlur={(event) => updateTransaction(row.id, { amount: spreadsheetAmount(event.target.value) ?? null })} /></td>
      <td className="p-2"><input aria-label={`Valuta ${formatDutchDate(row.date)} ${row.counterparty}`} className="input min-w-20" value={row.currency} onChange={(event) => updateTransaction(row.id, { currency: event.target.value.toUpperCase() })} /></td>
      <td className="p-2"><input aria-label={`Tegenpartij ${formatDutchDate(row.date)} ${row.counterparty}`} className="input min-w-48" value={row.counterparty} onChange={(event) => updateTransaction(row.id, { counterparty: event.target.value })} /></td>
      <td className="p-2"><textarea aria-label={`Omschrijving ${formatDutchDate(row.date)} ${row.counterparty}`} className="input min-w-64" value={row.description} onChange={(event) => updateTransaction(row.id, { description: event.target.value })} /></td>
      <td className="p-2"><input aria-label={`Bank-ID ${formatDutchDate(row.date)} ${row.counterparty}`} className="input min-w-40" value={row.bankId} onChange={(event) => updateTransaction(row.id, { bankId: event.target.value })} /></td>
      <td className="min-w-56 p-2">{bankTransactionErrors(row).map((message) => <p className="text-red-700" key={message}>{message}</p>)}<button className="ghost-button" onClick={() => change({ ...statement, transactions: statement.transactions.filter((item) => item.id !== row.id) })}>Verwijder leesregel</button></td>
    </tr>)}</tbody></table></div>
    {statement.transactions.length > 25 && <div className="mt-2 flex items-center gap-3"><button className="secondary-button" disabled={page === 0} onClick={() => setPage(page - 1)}>Vorige transacties</button><span>Pagina {page + 1} / {Math.ceil(statement.transactions.length / 25)}</span><button className="secondary-button" disabled={(page + 1) * 25 >= statement.transactions.length} onClick={() => setPage(page + 1)}>Volgende transacties</button></div>}
    <button className="secondary-button mt-3" disabled={statement.transactions.length >= 500} onClick={() => change({ ...statement, transactions: [...statement.transactions, { id: `${statement.id}:manual:${crypto.randomUUID()}`, date: "", amount: null, description: "", counterparty: "", currency: statement.currency || "EUR", page: 1, bankId: "" }] })}>Ontbrekende transactie toevoegen</button>
    {errors.map((message) => <p role="alert" className="mt-2 text-sm text-red-700" key={message}>{message}</p>)}
    <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={statement.verified} disabled={!!errors.length} onChange={(event) => onChange({ ...statement, verified: event.target.checked, complete: event.target.checked || statement.complete })} /><span>Deze rekening hoort bij de actieve administratie. Ik heb alle pagina&apos;s, transacties, bedragen, datums en saldi met de PDF gecontroleerd en ontbrekende regels aangevuld.</span></label>
  </article>;
}

export function BankPaymentPanel({ administrationId, administrationName, iban, fiscalYear, pin, existingEntries, storedStatements, newEntries, onApply, onUnlink }: {
  administrationId: string; administrationName: string; iban: string; fiscalYear: number; pin: string;
  existingEntries: ReconciliationEntry[]; storedStatements: BankStatement[]; newEntries: SpreadsheetEntry[];
  onApply: (input: BankReconciliationInput) => boolean; onUnlink: (transactionId: string) => void;
}) {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [allocations, setAllocations] = useState<BankAllocation[]>([]);
  const [allowAi, setAllowAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [acceptedSimilarIds, setAcceptedSimilarIds] = useState<string[]>([]);
  const [confirmedSignature, setConfirmedSignature] = useState("");
  const [paymentPage, setPaymentPage] = useState(0);
  const invoices = useMemo(() => paymentInvoices([...existingEntries, ...newEntries.map((entry, index) => ({ ...entry, id: `excel:${index}` }))]), [existingEntries, newEntries]);
  const transactions = [...storedStatements, ...statements].flatMap((statement) => statement.transactions);
  const available = transactions.filter((row) => !row.allocations?.length);
  const overlapErrors = bankOverlapErrors(storedStatements, statements, acceptedSimilarIds);
  const allocationErrors = validateBankAllocations(invoices, transactions, allocations);
  const errors = [...overlapErrors, ...allocationErrors, ...statements.flatMap((statement) => [...bankStatementErrors(statement), ...(!statement.verified ? [`Controleer en bevestig ${statement.fileName}.`] : [])])];
  const signature = JSON.stringify({ statements, allocations, acceptedSimilarIds, invoices, newEntries, transactions });
  const selectedInvoiceKeys = new Set(allocations.map((part) => part.invoiceKey));
  const canApply = !loading && !errors.length && !!(newEntries.length || statements.length || allocations.length) && confirmedSignature === signature;
  const setParts = (id: string, parts: BankAllocation[]) => { setAllocations((current) => [...current.filter((part) => part.transactionId !== id), ...parts]); setConfirmedSignature(""); };
  const download = async (id: string) => { try { await downloadAdministrationDocument(pin, administrationId, id); } catch (error) { setMessage((error as Error).message); } };
  return <section className="mt-6 border-t border-[var(--line)] pt-5" aria-labelledby="bank-match-title">
    <h3 id="bank-match-title">Bankafschriften controleren en betalingen koppelen</h3>
    <p className="mt-2 text-sm">{administrationName} · eigen IBAN {iban || "niet ingevuld"}. Upload je PDF-afschriften en controleer de leesresultaten. De koppeling verwerkt alleen betaalgegevens: er wordt geen extra omzet of bankkostenboeking aangemaakt.</p>
    <p className="mt-2 text-sm text-[var(--muted)]">PDF&apos;s worden meteen bewaard bij Documenten → Bank. Transacties en koppelingen worden pas na Verwerken opgeslagen. Rond deze controle af voordat je dit scherm verlaat.</p>
    <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={allowAi} disabled={loading} onChange={(event) => setAllowAi(event.target.checked)} /><span>Lees de gekozen bank-PDF&apos;s met AI. Hierbij worden deze afschriften via BoekBalans naar OpenAI gestuurd. Zonder deze keuze worden de PDF&apos;s bewaard en vul ik de transacties handmatig aan.</span></label>
    <label className="secondary-button mt-3 inline-flex">{loading ? "Bankafschriften lezen…" : "Kies bankafschriften (PDF)"}<input aria-label="Bankafschriften kiezen" className="sr-only" type="file" accept=".pdf,application/pdf" multiple disabled={loading} onChange={async (event) => {
      const files = Array.from(event.target.files ?? []); event.target.value = ""; if (!files.length) return;
      if (files.length > 12) { setMessage("Kies maximaal twaalf PDF-afschriften tegelijk."); return; }
      setLoading(true); setConfirmedSignature(""); setMessage(""); setUploadErrors([]);
      const knownDigests = new Set([...storedStatements, ...statements].map((statement) => statement.id));
      for (const file of files) {
        try {
          if (!/\.pdf$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error("Gebruik PDF-bestanden van maximaal 5 MB.");
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          if (knownDigests.has(digest)) { setUploadErrors((current) => [...current, `${file.name}: dit afschrift is al ingelezen; niet dubbel toegevoegd.`]); continue; }
          setMessage(`${file.name} bewaren${allowAi ? " en lezen" : ""}…`);
          const form = new FormData(); form.set("file", file); form.set("administrationId", administrationId); form.set("year", String(fiscalYear)); form.set("pin", pin); form.set("aiConsent", String(allowAi));
          const response = await fetch("/api/bank-statements/analyze", { method: "POST", body: form });
          const data = await response.json() as { statement?: BankStatement; error?: string; notice?: string };
          if (!response.ok || !data.statement) throw new Error(data.error || "Bankafschrift kon niet worden gelezen.");
          const statement = data.statement;
          knownDigests.add(statement.id);
          if (storedStatements.some((item) => item.id === statement.id)) { setMessage(`${file.name}: dit afschrift is al verwerkt; het is niet dubbel toegevoegd.`); continue; }
          setStatements((current) => current.some((item) => item.id === statement.id) ? current : [...current, statement]);
          setMessage(data.notice || `${file.name} gelezen. Controleer eerst de transacties en saldi met het originele afschrift.`);
        } catch (error) { setUploadErrors((current) => [...current, `${file.name}: ${(error as Error).message}`]); }
      }
      setLoading(false);
    }} /></label>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {uploadErrors.map((error, index) => <p role="alert" className="mt-2 text-sm text-amber-900" key={index}>{error}</p>)}
    {statements.map((statement) => <StatementReview key={statement.id} statement={statement} onDownload={() => { void download(statement.documentId); }} onChange={(next) => { setStatements((current) => current.map((item) => item.id === next.id ? next : item)); setConfirmedSignature(""); }} onRemove={() => { setStatements((current) => current.filter((item) => item.id !== statement.id)); setAllocations((current) => current.filter((part) => !statement.transactions.some((row) => row.id === part.transactionId))); setConfirmedSignature(""); }} />)}
    <div className="mt-5 rounded-lg border border-[var(--line)] p-4"><h4 className="font-semibold">Koppelingen voorstellen en beoordelen</h4>
      <p className="mt-2 text-sm">{newEntries.length} nieuwe Excel-regels · {invoices.length} open facturen · {available.length} ongekoppelde banktransacties · {selectedInvoiceKeys.size} facturen in de koppeling.</p>
      <p className="mt-2 text-sm text-[var(--muted)]">Een voorstel vereist een factuurnummer met een sluitend bedrag, of een eenduidige klantnaam én bedrag. Alleen hetzelfde bedrag is onvoldoende. Combineer deelbetalingen tot een volledig factuurbedrag; splits verzamelbetalingen over de bijbehorende facturen. Niet-gekoppelde betalingen blijven bewaard voor een volgende controle.</p>
      {!!allocations.length && <p className="mt-2 text-sm text-[var(--muted)]">Voorstellen opnieuw opbouwen vervangt de huidige handmatige koppelingen in deze controle.</p>}
      <button className="secondary-button mt-3" disabled={loading || !!overlapErrors.length || statements.some((statement) => !statement.verified || bankStatementErrors(statement).length)} onClick={() => { setAllocations(proposeBankAllocations(invoices, transactions)); setConfirmedSignature(""); setMessage("Voorstellen opnieuw opgebouwd op basis van factuurnummer/bedrag of unieke klantnaam/bedrag. Controleer iedere koppeling; eerdere handmatige koppelingen in deze controle zijn vervangen."); }}>Maak koppelvoorstellen</button>
    </div>
    <datalist id={`bank-invoices-${administrationId}`}>{invoices.filter((invoice) => !invoice.error).map((invoice) => <option key={invoice.key} value={invoice.invoiceNumber}>{invoice.relation} · {money.format(invoice.amount)}</option>)}</datalist>
    {!!available.length && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Bankdatum / bron", "Tegenpartij / omschrijving", "Bankbedrag", "Factuur en gekoppeld bedrag"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{available.slice(paymentPage * 25, (paymentPage + 1) * 25).map((row) => {
      const parts = allocations.filter((part) => part.transactionId === row.id), statement = [...storedStatements, ...statements].find((item) => item.transactions.some((item) => item.id === row.id))!;
      return <tr key={row.id} className="border-t border-[var(--line)] align-top"><td className="p-2 whitespace-nowrap">{formatDutchDate(row.date)}<p className="text-xs">{statement.fileName} · p. {row.page}</p></td><td className="min-w-56 p-2">{row.counterparty}<p>{row.description}</p>
        {(overlapErrors.some((message) => message.startsWith(`${row.id}: mogelijk overlappend`)) || acceptedSimilarIds.includes(row.id)) && <label className="mt-2 flex gap-2 text-amber-900"><input type="checkbox" checked={acceptedSimilarIds.includes(row.id)} onChange={(event) => { setAcceptedSimilarIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)); setConfirmedSignature(""); }} />Ik heb met de bron gecontroleerd dat dit een aparte betaling is, ondanks de gelijke gegevens in een ander afschrift.</label>}
      </td><td className="p-2 whitespace-nowrap">{row.amount === null ? "Onbekend" : money.format(row.amount)}<p className="text-xs">{parts.length ? `Gekoppeld: ${money.format(parts.reduce((sum, part) => sum + part.amount, 0))}` : "Nog niet gekoppeld"}</p></td><td className="min-w-96 p-2">
        {parts.map((part, index) => <div className="mb-2 flex gap-2" key={index}><input aria-label={`Factuur bij betaling ${formatDutchDate(row.date)} ${row.counterparty} regel ${index + 1}`} className="input" list={`bank-invoices-${administrationId}`} placeholder="Zoek factuurnummer" value={invoices.find((invoice) => invoice.key === part.invoiceKey)?.invoiceNumber ?? part.invoiceKey} onChange={(event) => { const target = invoices.find((invoice) => invoice.invoiceNumber.trim().toLowerCase() === event.target.value.trim().toLowerCase() && !invoice.error); setParts(row.id, parts.map((item, i) => i === index ? { ...item, invoiceKey: target?.key ?? event.target.value, amount: target ? Math.sign(target.amount) === Math.sign(row.amount!) ? Math.sign(row.amount!) * Math.min(Math.abs(target.amount), Math.abs(row.amount! - parts.reduce((sum, item, i) => i === index ? sum : sum + (Number.isFinite(item.amount) ? item.amount : 0), 0))) : row.amount ?? 0 : item.amount } : item)); }} /><input aria-label={`Gekoppeld bedrag ${formatDutchDate(row.date)} ${row.counterparty} regel ${index + 1}`} className="input w-32" inputMode="decimal" key={`${part.invoiceKey}:${part.amount}`} defaultValue={Number.isFinite(part.amount) ? String(part.amount).replace(".", ",") : ""} onBlur={(event) => setParts(row.id, parts.map((item, i) => i === index ? { ...item, amount: spreadsheetAmount(event.target.value) ?? NaN } : item))} /><button className="ghost-button" aria-label={`Koppeling verwijderen ${formatDutchDate(row.date)} ${row.counterparty} regel ${index + 1}`} onClick={() => setParts(row.id, parts.filter((_, i) => i !== index))}>×</button></div>)}
        <button className="ghost-button" disabled={!!bankTransactionErrors(row).length} onClick={() => setParts(row.id, [...parts, { transactionId: row.id, invoiceKey: "", amount: row.amount! - parts.reduce((sum, part) => sum + (Number.isFinite(part.amount) ? part.amount : 0), 0) }])}>Factuur koppelen / bedrag splitsen</button>
      </td></tr>;
    })}</tbody></table></div>}
    {available.length > 25 && <div className="mt-3 flex items-center gap-3"><button className="secondary-button" disabled={!paymentPage} onClick={() => setPaymentPage(paymentPage - 1)}>Vorige betalingen</button><span>Pagina {paymentPage + 1} / {Math.ceil(available.length / 25)}</span><button className="secondary-button" disabled={(paymentPage + 1) * 25 >= available.length} onClick={() => setPaymentPage(paymentPage + 1)}>Volgende betalingen</button></div>}
    {invoices.filter((invoice) => invoice.error).map((invoice) => <p className="mt-2 text-sm text-red-700" key={invoice.key}>Factuur {invoice.invoiceNumber}: {invoice.error}</p>)}
    {errors.slice(0, 12).map((error, index) => { const row = transactions.find((item) => error.startsWith(`${item.id}:`)); return <p role="alert" className="mt-2 text-sm text-red-700" key={index}>{row ? `${formatDutchDate(row.date)} · ${row.counterparty || row.description.slice(0, 60)} · p. ${row.page}: ${error.slice(row.id.length + 2)}` : error}</p>; })}
    {errors.length > 12 && <p className="mt-2 text-sm">Er zijn nog {errors.length - 12} andere aandachtspunten. Los de getoonde meldingen op om verder te controleren.</p>}
    <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmedSignature === signature} onChange={(event) => setConfirmedSignature(event.target.checked ? signature : "")} /><span>Ik heb de geselecteerde Excel-facturen en alle voorgestelde/handmatige bankkoppelingen gecontroleerd. Alleen volledig aansluitende betalingen worden verwerkt; de overige facturen blijven open.</span></label>
    <button className="primary-button mt-3" disabled={!canApply} onClick={() => { if (canApply && onApply({ statements, allocations, acceptedSimilarIds })) { setStatements([]); setAllocations([]); setAcceptedSimilarIds([]); setConfirmedSignature(""); } }}>Facturen en bankkoppelingen verwerken</button>
    {!!storedStatements.length && <details className="mt-5"><summary className="cursor-pointer font-semibold">Eerder verwerkte bankafschriften en koppelingen</summary>{storedStatements.map((statement) => <div className="mt-3 border-t border-[var(--line)] pt-3" key={statement.id}><strong>{statement.fileName}</strong> · {statement.account}<button className="ghost-button" onClick={() => { void download(statement.documentId); }}>Download PDF</button>{statement.transactions.filter((row) => row.allocations?.length).map((row) => <div className="mt-2 text-sm" key={row.id}>{formatDutchDate(row.date)} · {money.format(row.amount ?? 0)} · {row.allocations!.map((part) => part.invoiceNumber).join(", ")}<button className="ghost-button" onClick={() => { onUnlink(row.id); setAllocations([]); setConfirmedSignature(""); }}>Ontkoppel betaling en bijbehorende facturen</button></div>)}</div>)}</details>}
  </section>;
}
