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

function StatementReview({ statement, onChange, onRemove, onDownload, onRetry, retryDisabled }: { statement: BankStatement; onChange: (next: BankStatement) => void; onRemove: () => void; onDownload: () => void; onRetry?: () => void; retryDisabled?: boolean }) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState("");
  const [manual, setManual] = useState(false);
  const errors = bankStatementErrors(statement);
  const change = (next: BankStatement) => onChange({ ...next, verified: false });
  const update = (id: string, fields: Partial<BankTransaction>) => change({ ...statement, transactions: statement.transactions.map((row) => row.id === id ? { ...row, ...fields } : row) });
  return <article className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">{statement.fileName}</h4><button className="secondary-button" onClick={onDownload}>Download bron-PDF</button></div>
    {statement.note && <p className="mt-3 text-sm text-[var(--muted)]">{statement.note}</p>}
    {!statement.transactions.length && !manual ? <div className="mt-4 rounded-lg bg-[var(--surface)] p-4"><p className="font-semibold">Er zijn nog geen transacties herkend.</p><p className="mt-2 text-sm">Je PDF is bewaard. Probeer het lezen opnieuw of vul de gegevens zelf aan.</p>
      <div className="mt-3 flex flex-wrap gap-2">{onRetry && <button className="primary-button" disabled={retryDisabled} onClick={onRetry}>PDF opnieuw lezen</button>}<button className="secondary-button" onClick={() => setManual(true)}>Zelf transacties invullen</button><button className="ghost-button" onClick={onRemove}>Uit deze controle halen</button></div>
      {onRetry && retryDisabled && <p className="mt-2 text-sm">Kies bij Bestanden eerst voor AI-herkenning.</p>}
    </div> : <>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3"><p>Rekening<br /><strong>{statement.account || "Nog invullen"}</strong></p><p>Beginsaldo<br /><strong>{statement.openingBalance === null ? "Onbekend" : money.format(statement.openingBalance)}</strong></p><p>Eindsaldo<br /><strong>{statement.closingBalance === null ? "Onbekend" : money.format(statement.closingBalance)}</strong></p></div>
      <details className="mt-3" open={!statement.account || statement.currency !== "EUR"}><summary className="cursor-pointer text-sm font-semibold">Rekening en saldi aanpassen</summary><div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-sm">Eigen rekening / IBAN<input className="input" value={statement.account} onChange={(event) => change({ ...statement, account: normalizeBankAccount(event.target.value) })} /></label>
        <label className="text-sm">Valuta<input className="input" value={statement.currency} onChange={(event) => change({ ...statement, currency: event.target.value.toUpperCase() })} /></label>
        <label className="text-sm">Beginsaldo<input className="input" inputMode="decimal" defaultValue={decimal(statement.openingBalance)} onBlur={(event) => change({ ...statement, openingBalance: spreadsheetAmount(event.target.value) ?? null })} /></label>
        <label className="text-sm">Eindsaldo<input className="input" inputMode="decimal" defaultValue={decimal(statement.closingBalance)} onBlur={(event) => change({ ...statement, closingBalance: spreadsheetAmount(event.target.value) ?? null })} /></label>
      </div></details>
      <p className="mt-4 text-sm">{statement.transactions.length} transacties · netto mutaties {money.format(statement.transactions.reduce((sum, row) => sum + (row.amount ?? 0), 0))}</p>
      {(statement.openingBalance === null || statement.closingBalance === null) && <p className="mt-2 text-sm text-amber-800">Een saldo ontbreekt. Controleer daarom alle mutaties met de PDF.</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Bankdatum", "Tegenpartij", "Omschrijving", "Bedrag", "Controle"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{statement.transactions.slice(page * 25, (page + 1) * 25).map((row) => <tr key={row.id} className="border-t border-[var(--line)] align-top">
        <td className="p-2">{editing === row.id ? <DutchDateInput aria-label={`Bankdatum ${row.counterparty}`} className="input min-w-36" value={row.date} onChange={(event) => update(row.id, { date: event.target.value })} /> : <>{formatDutchDate(row.date) || "Ontbreekt"}<p className="text-xs text-[var(--muted)]">Pagina {row.page || "?"}</p></>}</td>
        <td className="p-2">{editing === row.id ? <input aria-label={`Tegenpartij ${row.id}`} className="input" value={row.counterparty} onChange={(event) => update(row.id, { counterparty: event.target.value })} /> : row.counterparty || "—"}</td>
        <td className="max-w-sm p-2">{editing === row.id ? <textarea aria-label={`Omschrijving ${row.id}`} className="input" value={row.description} onChange={(event) => update(row.id, { description: event.target.value })} /> : row.description}</td>
        <td className="p-2 whitespace-nowrap">{editing === row.id ? <input aria-label={`Bankbedrag ${row.id}`} className="input w-32" inputMode="decimal" defaultValue={decimal(row.amount)} onBlur={(event) => update(row.id, { amount: spreadsheetAmount(event.target.value) ?? null })} /> : row.amount === null ? "Onbekend" : money.format(row.amount)}</td>
        <td className="min-w-40 p-2">{bankTransactionErrors(row).map((error) => <p className="text-xs text-red-700" key={error}>{error}</p>)}<button className="ghost-button" onClick={() => setEditing(editing === row.id ? "" : row.id)}>{editing === row.id ? "Gereed" : "Aanpassen"}</button>
          {editing === row.id && <details className="mt-2"><summary className="cursor-pointer text-xs">Meer gegevens</summary><label className="mt-2 block text-xs">Bronpagina<input type="number" min="1" className="input" value={row.page || ""} onChange={(event) => update(row.id, { page: Number(event.target.value) })} /></label><label className="block text-xs">Valuta<input className="input" value={row.currency} onChange={(event) => update(row.id, { currency: event.target.value.toUpperCase() })} /></label><label className="block text-xs">Unieke bank-ID<input className="input" value={row.bankId} onChange={(event) => update(row.id, { bankId: event.target.value })} /></label><button className="ghost-button" onClick={() => change({ ...statement, transactions: statement.transactions.filter((item) => item.id !== row.id) })}>Leesregel verwijderen</button></details>}
        </td>
      </tr>)}</tbody></table></div>
      {statement.transactions.length > 25 && <div className="mt-3 flex items-center gap-3"><button className="secondary-button" disabled={!page} onClick={() => setPage(page - 1)}>Vorige</button><span>Pagina {page + 1} / {Math.ceil(statement.transactions.length / 25)}</span><button className="secondary-button" disabled={(page + 1) * 25 >= statement.transactions.length} onClick={() => setPage(page + 1)}>Volgende</button></div>}
      <button className="ghost-button mt-3" disabled={statement.transactions.length >= 500} onClick={() => { const id = `${statement.id}:manual:${crypto.randomUUID()}`; change({ ...statement, transactions: [...statement.transactions, { id, date: "", amount: null, description: "", counterparty: "", currency: statement.currency || "EUR", page: 1, bankId: "" }] }); setEditing(id); setPage(Math.floor(statement.transactions.length / 25)); }}>+ Ontbrekende transactie toevoegen</button>
      {errors.map((error) => <p role="alert" className="mt-2 text-sm text-red-700" key={error}>{error}</p>)}
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={statement.verified} disabled={!!errors.length} onChange={(event) => onChange({ ...statement, verified: event.target.checked, complete: event.target.checked || statement.complete })} /><span>Ik heb de rekening, alle transacties, datums en saldi met de PDF gecontroleerd. Dit afschrift hoort bij deze administratie.</span></label>
      <details className="mt-3 text-sm"><summary className="cursor-pointer">Afschrift opnieuw lezen of weghalen</summary>{onRetry && !statement.transactions.length && <button className="ghost-button" disabled={retryDisabled} onClick={onRetry}>PDF opnieuw lezen</button>}<button className="ghost-button" onClick={onRemove}>Uit deze controle halen (bron-PDF blijft bewaard)</button></details>
    </>}
  </article>;
}

export function BankPaymentPanel({ administrationId, administrationName, iban, fiscalYear, pin, existingEntries, storedStatements, newEntries, onApply, onUnlink, stage = "all", onNext, hasSpreadsheetFile = false, canContinue = true }: {
  administrationId: string; administrationName: string; iban: string; fiscalYear: number; pin: string;
  existingEntries: ReconciliationEntry[]; storedStatements: BankStatement[]; newEntries: SpreadsheetEntry[];
  stage?: "all" | "files" | "review" | "matching"; onNext?: () => void; hasSpreadsheetFile?: boolean; canContinue?: boolean;
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
  const [reviewId, setReviewId] = useState("");
  const [filesByDigest, setFilesByDigest] = useState<Record<string, File>>({});
  const [paymentFilter, setPaymentFilter] = useState<"suggested" | "unmatched" | "all">("suggested");
  const [editingPayment, setEditingPayment] = useState("");
  const invoices = useMemo(() => paymentInvoices([...existingEntries, ...newEntries.map((entry, index) => ({ ...entry, id: `excel:${index}` }))]), [existingEntries, newEntries]);
  const transactions = [...storedStatements, ...statements].flatMap((statement) => statement.transactions);
  const available = transactions.filter((row) => !row.allocations?.length);
  const overlapErrors = bankOverlapErrors(storedStatements, statements, acceptedSimilarIds);
  const allocationErrors = validateBankAllocations(invoices, transactions, allocations);
  const errors = [...overlapErrors, ...allocationErrors, ...statements.flatMap((statement) => [...bankStatementErrors(statement), ...(!statement.verified ? [`Controleer en bevestig ${statement.fileName}.`] : [])])];
  const signature = JSON.stringify({ statements, allocations, acceptedSimilarIds, invoices, newEntries, transactions });
  const selectedInvoiceKeys = new Set(allocations.map((part) => part.invoiceKey));
  const canApply = (stage === "all" || stage === "matching") && !loading && !errors.length && !!(newEntries.length || statements.length || allocations.length) && confirmedSignature === signature;
  const setParts = (id: string, parts: BankAllocation[]) => { setAllocations((current) => [...current.filter((part) => part.transactionId !== id), ...parts]); setConfirmedSignature(""); };
  const postpone = (transactionId: string) => {
    const transactionIds = new Set([transactionId]), invoiceKeys = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const part of allocations) if (transactionIds.has(part.transactionId) || invoiceKeys.has(part.invoiceKey)) {
        if (!transactionIds.has(part.transactionId) || !invoiceKeys.has(part.invoiceKey)) changed = true;
        transactionIds.add(part.transactionId); invoiceKeys.add(part.invoiceKey);
      }
    }
    setAllocations((current) => current.filter((part) => !transactionIds.has(part.transactionId)));
    setConfirmedSignature(""); setEditingPayment(""); setPaymentPage(0); setPaymentFilter("unmatched");
  };
  const download = async (id: string) => { try { await downloadAdministrationDocument(pin, administrationId, id); } catch (error) { setMessage((error as Error).message); } };
  const readFiles = async (files: File[], useAi = allowAi) => {
    if (!files.length) return;
      if (files.length > 12) { setMessage("Kies maximaal twaalf PDF-afschriften tegelijk."); return; }
      setLoading(true); setConfirmedSignature(""); setMessage(""); setUploadErrors([]);
      const knownDigests = new Set([...storedStatements, ...statements.filter((item) => item.transactions.length || item.verified)].map((statement) => statement.id));
      for (const file of files) {
        try {
          if (!/\.pdf$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error("Gebruik PDF-bestanden van maximaal 5 MB.");
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          setFilesByDigest((current) => ({ ...current, [digest]: file }));
          if (knownDigests.has(digest)) { setUploadErrors((current) => [...current, `${file.name}: dit afschrift is al ingelezen; niet dubbel toegevoegd.`]); continue; }
          setMessage(`${file.name} bewaren${useAi ? " en lezen" : ""}…`);
          const form = new FormData(); form.set("file", file); form.set("administrationId", administrationId); form.set("year", String(fiscalYear)); form.set("pin", pin); form.set("aiConsent", String(useAi));
          const response = await fetch("/api/bank-statements/analyze", { method: "POST", body: form });
          const data = await response.json() as { statement?: BankStatement; error?: string; notice?: string };
          if (!response.ok || !data.statement) throw new Error(data.error || "Bankafschrift kon niet worden gelezen.");
          const statement = data.statement;
          knownDigests.add(statement.id);
          if (storedStatements.some((item) => item.id === statement.id)) { setMessage(`${file.name}: dit afschrift is al verwerkt; het is niet dubbel toegevoegd.`); continue; }
          setStatements((current) => current.some((item) => item.id === statement.id) ? current.map((item) => item.id === statement.id && !item.transactions.length && !item.verified ? statement : item) : [...current, statement]);
          setMessage(data.notice || `${file.name} gelezen. Controleer eerst de transacties en saldi met het originele afschrift.`);
        } catch (error) { setUploadErrors((current) => [...current, `${file.name}: ${(error as Error).message}`]); }
      }
      setLoading(false);

  };
  const activeStatement = statements.find((item) => item.id === reviewId) ?? statements.find((item) => !item.verified) ?? statements[0];
  const readyToMatch = canContinue && !loading && !statements.some((item) => !item.verified || bankStatementErrors(item).length) && !!(statements.length || storedStatements.length);
  const filtered = stage === "all" || paymentFilter === "all" ? available : paymentFilter === "suggested" ? available.filter((row) => allocations.some((part) => part.transactionId === row.id)) : available.filter((row) => !allocations.some((part) => part.transactionId === row.id) && (row.amount ?? 0) > 0);
  const buildProposals = () => { const next = proposeBankAllocations(invoices, transactions); setAllocations(next); setConfirmedSignature(""); setPaymentPage(0); setEditingPayment(""); setPaymentFilter(overlapErrors.length ? "all" : next.length ? "suggested" : "unmatched"); setMessage(""); };
  return <section className="mt-6 border-t border-[var(--line)] pt-5" aria-labelledby="bank-match-title">
    <h3 id="bank-match-title">{stage === "files" ? "Bankafschriften (PDF)" : stage === "review" ? "Bankafschriften controleren" : "Bankbetalingen koppelen"}</h3>
    {(stage === "files" || stage === "all") && <>
    <p className="mt-2 text-sm">{administrationName} · IBAN {iban || "niet ingevuld"}</p>
    <p className="mt-2 text-sm text-[var(--muted)]">Je PDF&apos;s worden bewaard bij Documenten → Bank. Rond de controle af voordat je dit scherm verlaat; koppelingen worden pas in de laatste stap opgeslagen.</p>
    <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={allowAi} disabled={loading} onChange={(event) => setAllowAi(event.target.checked)} /><span>Lees de gekozen bank-PDF&apos;s met AI. Ik geef toestemming om deze afschriften daarvoor naar OpenAI te sturen.</span></label>
    <label className="secondary-button mt-3 inline-flex">{loading ? "Bankafschriften lezen…" : "Kies bankafschriften (PDF)"}<input aria-label="Bankafschriften kiezen" className="sr-only" type="file" accept=".pdf,application/pdf" multiple disabled={loading || stage !== "all" && !allowAi} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; return readFiles(files); }} /></label>
    <details className="mt-3 text-sm"><summary className="cursor-pointer">Liever zonder AI invoeren</summary><p className="my-2">Je bewaart de PDF en vult de transacties daarna zelf in.</p><input aria-label="Bank-PDF zonder AI kiezen" type="file" accept=".pdf,application/pdf" multiple disabled={loading} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void readFiles(files, false); }} /></details>
    {!!statements.length && <ul className="mt-3 space-y-2 text-sm">{statements.map((item) => <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-3" key={item.id}><span><strong>{item.fileName}</strong> · {item.transactions.length ? `${item.transactions.length} transacties herkend` : "Nog geen transacties herkend"}</span>{!item.transactions.length && filesByDigest[item.id] && <button className="secondary-button" disabled={loading || !allowAi} onClick={() => readFiles([filesByDigest[item.id]])}>Opnieuw lezen</button>}</li>)}</ul>}
    {stage === "files" && <button className="primary-button mt-4" disabled={loading || !(hasSpreadsheetFile || statements.length || storedStatements.length)} onClick={onNext}>Bestanden controleren</button>}
    </>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {uploadErrors.map((error, index) => <p role="alert" className="mt-2 text-sm text-amber-900" key={index}>{error}</p>)}
    {(stage === "review" || stage === "all") && <>
      <p className="mt-2 text-sm text-[var(--muted)]">Open één afschrift tegelijk. Klopt alles met de PDF? Vink onderaan aan dat je het hebt gecontroleerd. Pas gegevens alleen aan als dat nodig is.</p>
      {!!statements.length && <div className="mt-3 flex flex-wrap gap-2">{statements.map((item) => <button key={item.id} className={item.id === activeStatement?.id ? "secondary-button" : "ghost-button"} onClick={() => setReviewId(item.id)}>{item.verified ? "✓ " : "○ "}{item.fileName}</button>)}</div>}
      {activeStatement ? <StatementReview key={activeStatement.id} statement={activeStatement} onDownload={() => { void download(activeStatement.documentId); }} onRetry={filesByDigest[activeStatement.id] ? () => { void readFiles([filesByDigest[activeStatement.id]]); } : undefined} retryDisabled={loading || !allowAi}
        onChange={(next) => { setReviewId(next.id); setStatements((current) => current.map((item) => item.id === next.id ? next : item)); setConfirmedSignature(""); }}
        onRemove={() => { setStatements((current) => current.filter((item) => item.id !== activeStatement.id)); setAllocations((current) => current.filter((part) => !activeStatement.transactions.some((row) => row.id === part.transactionId))); setConfirmedSignature(""); }} />
        : <p className="mt-3 text-sm">{available.length ? `${available.length} eerder ingelezen bankmutaties zijn beschikbaar om te koppelen.` : storedStatements.length ? "Alle eerder ingelezen bankmutaties zijn gekoppeld. In de volgende stap kun je eerdere koppelingen bekijken en zo nodig ontkoppelen." : "Voeg bij Bestanden eerst een PDF-bankafschrift toe."}</p>}
      {stage === "review" && <div className="mt-4"><p className="mb-3 text-sm">{statements.filter((item) => item.verified).length} van {statements.length} nieuwe afschriften gecontroleerd.</p><button className="primary-button" disabled={!readyToMatch} onClick={() => { buildProposals(); onNext?.(); }}>Koppelingen bekijken</button></div>}
    </>}
    {(stage === "matching" || stage === "all") && <>
    <div className="mt-3 rounded-lg border border-[var(--line)] p-4"><h4 className="font-semibold">Controleer de voorgestelde koppelingen</h4>
      <p className="mt-2 text-sm">{newEntries.length} nieuwe Excel-regels · {invoices.length} open facturen · {available.length} ongekoppelde banktransacties · {selectedInvoiceKeys.size} facturen in de koppeling.</p>
      <p className="mt-2 text-sm text-[var(--muted)]">Je verwerkt betaalgegevens; bankmutaties worden geen extra omzet- of kostenboekingen.</p>
      <p className="mt-2 text-sm text-[var(--muted)]">Een voorstel vereist een factuurnummer met een sluitend bedrag, of een eenduidige klantnaam én bedrag. Alleen hetzelfde bedrag is onvoldoende. Combineer deelbetalingen tot een volledig factuurbedrag; splits verzamelbetalingen over de bijbehorende facturen. Niet-gekoppelde betalingen blijven bewaard voor een volgende controle.</p>
      {!!allocations.length && <p className="mt-2 text-sm text-[var(--muted)]">Voorstellen opnieuw opbouwen vervangt de huidige handmatige koppelingen in deze controle.</p>}
      <details className="mt-3 text-sm"><summary className="cursor-pointer">Voorstellen opnieuw opbouwen</summary><p className="my-2">Dit vervangt de handmatige koppelingen in deze controle.</p><button className="secondary-button" disabled={loading || !!overlapErrors.length || statements.some((item) => !item.verified || bankStatementErrors(item).length)} onClick={buildProposals}>Maak koppelvoorstellen</button></details>
    </div>
    {stage !== "all" && <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Bankmutaties tonen">{([["suggested", "Voorgestelde koppelingen"], ["unmatched", "Ontvangsten zonder koppeling"], ["all", "Alle bankmutaties"]] as const).map(([value, label]) => <button key={value} className={paymentFilter === value ? "secondary-button" : "ghost-button"} aria-pressed={paymentFilter === value} onClick={() => { setPaymentFilter(value); setPaymentPage(0); }}>{label}</button>)}</div>}
    {!filtered.length && <p className="my-4 text-sm">{paymentFilter === "suggested" ? "Nog geen koppelingen. Kies Ontvangsten zonder koppeling om zelf een factuur te selecteren." : "Geen bankmutaties in deze selectie."}</p>}
    <datalist id={`bank-invoices-${administrationId}`}>{invoices.filter((invoice) => !invoice.error).map((invoice) => <option key={invoice.key} value={invoice.invoiceNumber}>{invoice.relation} · {money.format(invoice.amount)}</option>)}</datalist>
    {!!filtered.length && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Bankdatum / bron", "Tegenpartij / omschrijving", "Bankbedrag", "Factuur en gekoppeld bedrag"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.slice(paymentPage * 25, (paymentPage + 1) * 25).map((row) => {
      const parts = allocations.filter((part) => part.transactionId === row.id), statement = [...storedStatements, ...statements].find((item) => item.transactions.some((item) => item.id === row.id))!;
      return <tr key={row.id} className="border-t border-[var(--line)] align-top"><td className="p-2 whitespace-nowrap">{formatDutchDate(row.date)}<p className="text-xs">{statement.fileName} · p. {row.page}</p></td><td className="min-w-56 p-2">{row.counterparty}<p>{row.description}</p>
        {(overlapErrors.some((message) => message.startsWith(`${row.id}: mogelijk overlappend`)) || acceptedSimilarIds.includes(row.id)) && <label className="mt-2 flex gap-2 text-amber-900"><input type="checkbox" checked={acceptedSimilarIds.includes(row.id)} onChange={(event) => { setAcceptedSimilarIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)); setConfirmedSignature(""); }} />Ik heb met de bron gecontroleerd dat dit een aparte betaling is, ondanks de gelijke gegevens in een ander afschrift.</label>}
      </td><td className="p-2 whitespace-nowrap">{row.amount === null ? "Onbekend" : money.format(row.amount)}<p className="text-xs">{parts.length ? `Gekoppeld: ${money.format(parts.reduce((sum, part) => sum + part.amount, 0))}` : "Nog niet gekoppeld"}</p></td><td className="min-w-96 p-2">
        {editingPayment !== row.id ? <><div className="space-y-1">{parts.map((part, index) => <p key={index}><strong>{invoices.find((item) => item.key === part.invoiceKey)?.invoiceNumber || "Kies factuur"}</strong> · {money.format(Number.isFinite(part.amount) ? part.amount : 0)}</p>)}</div><button className="ghost-button mt-2" disabled={!!bankTransactionErrors(row).length} onClick={() => { setEditingPayment(row.id); if (!parts.length) setParts(row.id, [{ transactionId: row.id, invoiceKey: "", amount: row.amount ?? 0 }]); }}>{parts.length ? "Koppeling aanpassen" : "Factuur kiezen"}</button>{!!parts.length && <button className="ghost-button" title="Haal deze betaling en alle bijbehorende facturen uit de koppeling. Ze blijven bewaard voor later." onClick={() => postpone(row.id)}>Later koppelen</button>}</> : <>
        {parts.map((part, index) => <div className="mb-2 flex gap-2" key={index}><input aria-label={`Factuur bij betaling ${formatDutchDate(row.date)} ${row.counterparty} regel ${index + 1}`} className="input" list={`bank-invoices-${administrationId}`} placeholder="Zoek factuurnummer" value={invoices.find((invoice) => invoice.key === part.invoiceKey)?.invoiceNumber ?? part.invoiceKey} onChange={(event) => { const target = invoices.find((invoice) => invoice.invoiceNumber.trim().toLowerCase() === event.target.value.trim().toLowerCase() && !invoice.error); setParts(row.id, parts.map((item, i) => i === index ? { ...item, invoiceKey: target?.key ?? event.target.value, amount: target ? Math.sign(target.amount) === Math.sign(row.amount!) ? Math.sign(row.amount!) * Math.min(Math.abs(target.amount), Math.abs(row.amount! - parts.reduce((sum, item, i) => i === index ? sum : sum + (Number.isFinite(item.amount) ? item.amount : 0), 0))) : row.amount ?? 0 : item.amount } : item)); }} /><input aria-label={`Gekoppeld bedrag ${formatDutchDate(row.date)} ${row.counterparty} regel ${index + 1}`} className="input w-32" inputMode="decimal" key={`${part.invoiceKey}:${part.amount}`} defaultValue={Number.isFinite(part.amount) ? String(part.amount).replace(".", ",") : ""} onBlur={(event) => setParts(row.id, parts.map((item, i) => i === index ? { ...item, amount: spreadsheetAmount(event.target.value) ?? NaN } : item))} /><button className="ghost-button" aria-label={`Koppeling verwijderen ${formatDutchDate(row.date)} ${row.counterparty} regel ${index + 1}`} onClick={() => setParts(row.id, parts.filter((_, i) => i !== index))}>×</button></div>)}
        <button className="ghost-button" disabled={!!bankTransactionErrors(row).length} onClick={() => setParts(row.id, [...parts, { transactionId: row.id, invoiceKey: "", amount: row.amount! - parts.reduce((sum, part) => sum + (Number.isFinite(part.amount) ? part.amount : 0), 0) }])}>+ Factuur toevoegen / betaling splitsen</button>
        <button className="ghost-button" onClick={() => setEditingPayment("")}>Gereed</button></>}
      </td></tr>;
    })}</tbody></table></div>}
    {filtered.length > 25 && <div className="mt-3 flex items-center gap-3"><button className="secondary-button" disabled={!paymentPage} onClick={() => setPaymentPage(paymentPage - 1)}>Vorige betalingen</button><span>Pagina {paymentPage + 1} / {Math.ceil(filtered.length / 25)}</span><button className="secondary-button" disabled={(paymentPage + 1) * 25 >= filtered.length} onClick={() => setPaymentPage(paymentPage + 1)}>Volgende betalingen</button></div>}
    {invoices.filter((invoice) => invoice.error).map((invoice) => <p className="mt-2 text-sm text-red-700" key={invoice.key}>Factuur {invoice.invoiceNumber}: {invoice.error}</p>)}
    {errors.slice(0, 12).map((error, index) => { const row = transactions.find((item) => error.startsWith(`${item.id}:`)); return <p role="alert" className="mt-2 text-sm text-red-700" key={index}>{row ? `${formatDutchDate(row.date)} · ${row.counterparty || row.description.slice(0, 60)} · p. ${row.page}: ${error.slice(row.id.length + 2)}` : error}</p>; })}
    {errors.length > 12 && <p className="mt-2 text-sm">Er zijn nog {errors.length - 12} andere aandachtspunten. Los de getoonde meldingen op om verder te controleren.</p>}
    <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmedSignature === signature} onChange={(event) => setConfirmedSignature(event.target.checked ? signature : "")} /><span>Ik heb de geselecteerde Excel-facturen en alle voorgestelde/handmatige bankkoppelingen gecontroleerd. Alleen volledig aansluitende betalingen worden verwerkt; de overige facturen blijven open.</span></label>
    <button className="primary-button mt-3" disabled={!canApply} onClick={() => { if (canApply && onApply({ statements, allocations, acceptedSimilarIds })) { setStatements([]); setAllocations([]); setAcceptedSimilarIds([]); setConfirmedSignature(""); } }}>Opslaan en afronden</button>
    {!!storedStatements.length && <details className="mt-5"><summary className="cursor-pointer font-semibold">Eerder verwerkte bankafschriften en koppelingen</summary>{storedStatements.map((statement) => <div className="mt-3 border-t border-[var(--line)] pt-3" key={statement.id}><strong>{statement.fileName}</strong> · {statement.account}<button className="ghost-button" onClick={() => { void download(statement.documentId); }}>Download PDF</button>{statement.transactions.filter((row) => row.allocations?.length).map((row) => <div className="mt-2 text-sm" key={row.id}>{formatDutchDate(row.date)} · {money.format(row.amount ?? 0)} · {row.allocations!.map((part) => part.invoiceNumber).join(", ")}<button className="ghost-button" onClick={() => { onUnlink(row.id); setAllocations([]); setConfirmedSignature(""); }}>Ontkoppel betaling en bijbehorende facturen</button></div>)}</div>)}</details>}
    </>}
  </section>;
}
