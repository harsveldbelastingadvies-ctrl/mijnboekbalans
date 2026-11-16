"use client";
import { useState } from "react";
import { DutchDateInput } from "./dutch-date-input";
import { QuickContactDialog } from "./quick-contact-dialog";
import { createContact, type Contact } from "../lib/contacts";
import { calculateNewSalesLines, invoiceDateAfter, prepareSalesInvoice, type InvoiceAdministration, type InvoiceParty, type SalesInvoiceDraft, type IssuedSalesInvoice } from "../lib/issued-sales-invoices";
import { buildSalesInvoicePdf } from "../lib/sales-invoice-pdf";
import { getNextInvoiceNumber } from "../lib/invoice-numbering";
import { formatDutchDate } from "../lib/dutch-date";
const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const line = () => ({ id: crypto.randomUUID(), description: "", quantity: "1", price: "", vatRate: "21", category: "Omzet" });
type Admin = InvoiceAdministration & { name: string; owner: string; address?: string; vatNumber: string; kvk: string; iban: string; email?: string; phone?: string; contacts: Contact[]; salesInvoiceDraft?: SalesInvoiceDraft; salesInvoiceIssuer?: InvoiceParty; salesInvoiceClosing?: string };
function fresh(admin: Admin): SalesInvoiceDraft {
  const now = new Date().toISOString().slice(0, 10), date = now.startsWith(String(admin.fiscalYear)) ? now : `${admin.fiscalYear}-01-01`;
  return { id: crypto.randomUUID(), date, deliveryDate: date, dueDate: invoiceDateAfter(date), customerName: "", customerAddress: "", prices: "exclusive", zeroVatConfirmed: false, lines: [line()], issuer: admin.salesInvoiceIssuer ?? { name: admin.name, address: admin.address || "", vatNumber: admin.vatNumber, kvk: admin.kvk, iban: admin.iban, accountName: admin.name, email: admin.email || "", phone: admin.phone || "" }, closing: admin.salesInvoiceClosing ?? `Met vriendelijke groet,\n${admin.owner || admin.name}` };
}
function saveBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
export function SalesInvoicePanel({ admin, saved, onSave, onContact, onIssue, onDownload }: { admin: Admin; saved: boolean; onSave: (draft: SalesInvoiceDraft) => void; onContact: (contact: Contact) => void; onIssue: (draft: SalesInvoiceDraft) => Promise<void>; onDownload: (invoice: IssuedSalesInvoice) => Promise<void> }) {
  const [draft, setDraft] = useState(() => admin.salesInvoiceDraft ?? fresh(admin));
  const [error, setError] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false); const [confirmed, setConfirmed] = useState(""); const [addingContact, setAddingContact] = useState(false);
  const signature = JSON.stringify(draft), stored = JSON.stringify(admin.salesInvoiceDraft) === signature;
  let totals: { net: number; vat: number; gross: number } | null = null;
  try { totals = calculateNewSalesLines(draft).reduce((s, l) => ({ net: s.net + l.net, vat: s.vat + l.vat, gross: s.gross + l.gross }), { net: 0, vat: 0, gross: 0 }); } catch { /* Incomplete form: show no invented total. */ }
  const change = (patch: Partial<SalesInvoiceDraft>) => { const next = { ...draft, ...patch }; setDraft(next); onSave(next); setError(""); setNote(""); };
  const selectContact = (contact: Contact) => { change({ customerName: contact.name, customerAddress: contact.address }); setAddingContact(false); };
  const preview = async () => { try { const { invoice } = prepareSalesInvoice(admin, draft, "concept", new Date().toISOString()); saveBlob(buildSalesInvoicePdf(invoice, true), "concept-verkoopfactuur.pdf"); setError(""); } catch (e) { setError((e as Error).message); } };
  const issue = async () => { if (busy) return; setBusy(true); setError(""); try { await onIssue(draft); setUncertain(false); setDraft(fresh({ ...admin, salesInvoiceIssuer: draft.issuer, salesInvoiceClosing: draft.closing })); setConfirmed(""); setNote("Factuur opgeslagen en geboekt. Download de definitieve PDF hieronder."); } catch (e) { const retry = (e as Error & { code?: string }).code === "ISSUE_UNCERTAIN"; setUncertain(retry); setError((e as Error).message); } finally { setBusy(false); } };
  return <section className="sales-invoice-workspace mt-6">
    <div className="section-title"><div><p className="eyebrow">Van concept naar factuur</p><h2>Verkoopfactuur maken</h2></div><span className="status-pill">Volgend nummer: {getNextInvoiceNumber(admin)}</span></div>
    <p className="mt-3 text-sm text-[var(--muted)]">Maak je factuur, controleer het concept en leg deze definitief vast. Het factuurnummer wordt bij uitgifte toegekend; daarna staan de factuur en boekingen samen op de server. Voor Nederlandse verkoop met 21%, 9% of beoordeelde 0%-btw.</p>
    <fieldset disabled={busy || uncertain} className="sales-invoice-editor">
      <div className="sales-invoice-main">
        <section className="panel"><h3>1. Klant en factuurgegevens</h3><div className="grid gap-4 md:grid-cols-2 mt-4">
          <label className="field">Bestaande klant<select className="input" value="" onChange={e => { const c = admin.contacts.find(c => c.id === e.target.value); if (c) selectContact(c); }}><option value="">Selecteer een klant…</option>{admin.contacts.filter(c => c.type !== "supplier").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <div className="flex items-end"><button type="button" className="secondary-button" onClick={() => setAddingContact(true)}>+ Nieuwe debiteur</button></div>
          <label className="field">Naam klant<input className="input" value={draft.customerName} maxLength={200} onChange={e => change({ customerName: e.target.value })} /></label>
          <label className="field">Volledig factuuradres<textarea className="input" rows={3} value={draft.customerAddress} maxLength={600} onChange={e => change({ customerAddress: e.target.value })} /></label>
          <label className="field">Factuurdatum<DutchDateInput className="input" value={draft.date} onChange={e => change({ date: e.target.value, dueDate: invoiceDateAfter(e.target.value) })} /></label>
          <label className="field">Vervaldatum<DutchDateInput className="input" value={draft.dueDate} onChange={e => change({ dueDate: e.target.value })} /></label>
          <label className="field">Leveringsdatum / vooruitbetaling<DutchDateInput className="input" value={draft.deliveryDate} onChange={e => change({ deliveryDate: e.target.value })} /></label>
          <label className="field">Ingevoerde prijzen<select className="input" value={draft.prices} onChange={e => change({ prices: e.target.value as SalesInvoiceDraft["prices"] })}><option value="exclusive">Exclusief btw</option><option value="inclusive">Inclusief btw</option></select><small>Wisselen verandert de berekening; controleer je bedragen.</small></label>
        </div></section>
        <section className="panel"><h3>2. Omschrijvingen en bedragen</h3><div className="sales-lines">{draft.lines.map((l, index) => <div className="sales-line" key={l.id}>
          <label className="field sales-line-description">Omschrijving {index + 1}<textarea className="input" rows={3} maxLength={2000} value={l.description} onChange={e => change({ lines: draft.lines.map(v => v.id === l.id ? { ...v, description: e.target.value } : v) })} /></label>
          {([['quantity', 'Aantal'], ['price', draft.prices === 'inclusive' ? 'Prijs incl. btw' : 'Prijs ex. btw']] as const).map(([key, label]) => <label className="field" key={key}>{label}<input className="input" inputMode="decimal" value={l[key]} onChange={e => change({ lines: draft.lines.map(v => v.id === l.id ? { ...v, [key]: e.target.value } : v) })} /></label>)}
          <label className="field">Btw<select className="input" value={l.vatRate} onChange={e => change({ lines: draft.lines.map(v => v.id === l.id ? { ...v, vatRate: e.target.value } : v) })}>{[21, 9, 0].map(r => <option key={r} value={r}>{r}%</option>)}</select></label>
          <label className="field sales-line-description">Omzetcategorie<input className="input" value={l.category} maxLength={100} onChange={e => change({ lines: draft.lines.map(v => v.id === l.id ? { ...v, category: e.target.value } : v) })} /></label>
          <button type="button" className="secondary-button" disabled={draft.lines.length === 1} onClick={() => change({ lines: draft.lines.filter(v => v.id !== l.id) })}>Regel verwijderen</button>
        </div>)}</div><button type="button" className="secondary-button mt-4" disabled={draft.lines.length >= 100} onClick={() => change({ lines: [...draft.lines, line()] })}>+ Factuurregel</button>
        {draft.lines.some(l => l.vatRate === "0") && <label className="mt-4 flex gap-2"><input type="checkbox" checked={draft.zeroVatConfirmed} onChange={e => change({ zeroVatConfirmed: e.target.checked })} />Ik heb beoordeeld dat dit Nederlandse omzet met 0% btw is. Gebruik dit niet voor vrijstelling, verlegging of buitenlandse omzet.</label>}</section>
        <details className="panel" open={!draft.issuer.address || !draft.issuer.vatNumber || !draft.issuer.iban}><summary>3. Afzender en betaalgegevens</summary><p className="text-sm mt-3">Deze gegevens staan op de PDF en worden na uitgifte bewaard voor je volgende factuur.</p><div className="grid gap-4 md:grid-cols-2 mt-4">
          {([['name', 'Bedrijfsnaam'], ['vatNumber', 'Btw-identificatienummer'], ['kvk', 'KvK-nummer (indien ingeschreven)'], ['iban', 'IBAN'], ['accountName', 'Rekeninghouder'], ['email', 'E-mail (optioneel)'], ['phone', 'Telefoon (optioneel)']] as const).map(([key, label]) => <label className="field" key={key}>{label}<input className="input" maxLength={200} value={draft.issuer[key]} onChange={e => change({ issuer: { ...draft.issuer, [key]: e.target.value } })} /></label>)}
          <label className="field">Volledig vestigingsadres<textarea className="input" rows={3} maxLength={600} value={draft.issuer.address} onChange={e => change({ issuer: { ...draft.issuer, address: e.target.value } })} /></label>
        </div></details>
        <section className="panel"><h3>4. Persoonlijke afsluiting</h3><textarea aria-label="Persoonlijke afsluiting" className="input mt-4" rows={3} maxLength={1500} value={draft.closing} onChange={e => change({ closing: e.target.value })} /></section>
      </div>
      <aside className="panel sales-invoice-total"><p className="eyebrow">Controleer je factuur</p><h3>{draft.customerName || "Nieuwe verkoopfactuur"}</h3><dl><div><dt>Exclusief btw</dt><dd>{totals ? money.format(totals.net) : "—"}</dd></div><div><dt>Btw</dt><dd>{totals ? money.format(totals.vat) : "—"}</dd></div><div className="sales-grand-total"><dt>Te voldoen</dt><dd>{totals ? money.format(totals.gross) : "—"}</dd></div></dl><p className="text-sm">Nog geen betaling ontvangen. Na uitgifte wordt dit als openstaande verkoopfactuur geboekt.</p>
      <button type="button" className="secondary-button" onClick={() => { onSave(draft); setNote("Concept wordt opgeslagen. Wacht op ‘Opgeslagen op server’ voordat je de factuur uitgeeft."); }}>Concept opslaan</button><button type="button" className="secondary-button" onClick={() => void preview()}>Concept-PDF bekijken</button>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed === signature} onChange={e => setConfirmed(e.target.checked ? signature : "")} />Ik heb de klant, data, bedragen en afzender gecontroleerd. Definitieve facturen kunnen niet worden gewijzigd.</label>
      <button type="button" className="primary-button" disabled={!saved || !stored || confirmed !== signature || !totals} onClick={() => void issue()}>Definitief vastleggen</button><small>Je concept wordt automatisch opgeslagen. De definitieve PDF verschijnt na bevestiging door de server. Versturen doe je zelf.</small></aside>
    </fieldset>
    {uncertain && <div className="notice mt-4"><p>De serverbevestiging ontbreekt. Wijzig dit concept niet; controleer hetzelfde verzoek om dubbele facturen te voorkomen.</p><button className="primary-button mt-3" disabled={busy} onClick={() => void issue()}>{busy ? "Controleren…" : "Uitgifte opnieuw controleren"}</button></div>}
    {error && <p className="notice mt-4" role="alert">{error}</p>}{note && <p className="notice mt-4" role="status">{note}</p>}
    <section className="panel mt-6"><h3>Definitieve verkoopfacturen</h3><p className="text-sm mt-2">De originele PDF blijft bewaard. Betalingen koppel je bij Facturen inlezen via het bankafschrift.</p>{!admin.issuedSalesInvoices?.length ? <p className="mt-4 text-sm">Hier verschijnen je zelf gemaakte facturen.</p> : <div className="table-wrap mt-4"><table><thead><tr><th>Nummer</th><th>Klant</th><th>Datum</th><th>Vervalt</th><th>Inclusief btw</th><th>PDF</th></tr></thead><tbody>{admin.issuedSalesInvoices.map(i => <tr key={i.id}><td>{i.number}</td><td>{i.customerName}</td><td>{formatDutchDate(i.date)}</td><td>{formatDutchDate(i.dueDate)}</td><td>{money.format(i.gross)}</td><td><button className="secondary-button" onClick={() => { void onDownload(i).catch(e => setError((e as Error).message)); }}>Download factuur</button></td></tr>)}</tbody></table></div>}</section>
    {addingContact && <QuickContactDialog initialName={draft.customerName} role="customer" contacts={admin.contacts} onSave={v => { const c = createContact(v, crypto.randomUUID()); onContact(c); selectContact(c); }} onSelect={selectContact} onClose={() => setAddingContact(false)} />}
  </section>;
}
