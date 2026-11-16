import type { ReactNode } from "react";
import { formatDutchDate } from "../lib/dutch-date";

const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

/** Read-only view of the existing booking calculations; does not calculate or save entries. */
export function InvoiceEntrySummary({ type, relation, invoiceNumber, date, status, paidDate, base, vat, gross, lineCount, children }: {
  type: "income" | "expense"; relation: string; invoiceNumber: string; date: string;
  status: "paid" | "open"; paidDate: string; base: number; vat: number; gross: number;
  lineCount: number; children?: ReactNode;
}) {
  return <aside className="invoice-editor-summary" aria-labelledby="invoice-entry-summary-title">
    <div className="invoice-summary-heading"><span className="invoice-kind-badge">{type === "income" ? "Verkoop" : "Inkoop"}</span><span>{lineCount} {lineCount === 1 ? "factuurregel" : "factuurregels"}</span></div>
    <h4 id="invoice-entry-summary-title">Jouw boeking</h4>
    <p className="invoice-summary-relation">{relation || (type === "income" ? "Kies een klant" : "Kies een leverancier")}</p>
    <dl className="invoice-summary-reference"><div><dt>Factuurnummer</dt><dd>{invoiceNumber || "Nog invullen"}</dd></div><div><dt>Factuurdatum</dt><dd>{formatDutchDate(date) || "Nog invullen"}</dd></div></dl>
    <dl className="invoice-summary-amounts" aria-live="polite"><div><dt>Exclusief btw</dt><dd>{money.format(base)}</dd></div><div><dt>Btw op factuur</dt><dd>{money.format(vat)}</dd></div><div className="invoice-summary-total"><dt>Totaal incl. btw</dt><dd>{money.format(gross)}</dd></div></dl>
    <div className="invoice-summary-payment"><span className={`invoice-payment-badge ${status === "paid" ? "is-paid" : "is-open"}`}>{status === "paid" ? "Betaald" : "Openstaand"}</span>{status === "paid" && <span>{formatDutchDate(paidDate) || "Betaaldatum nog invullen"}</span>}</div>
    <p className="invoice-summary-caption">Samenvatting van je invoer. Controleer de gegevens met de originele factuur.</p>
    {children}
  </aside>;
}
