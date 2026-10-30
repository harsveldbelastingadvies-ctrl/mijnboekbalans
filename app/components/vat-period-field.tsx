import { resolveVatDate, vatDateError, type VatPeriod } from "../lib/vat-period";

export function VatPeriodField({ date, selection, year, period, onChange }: {
  date: string; selection?: string; year: number; period: VatPeriod;
  onChange: (value: string) => void;
}) {
  const vatDate = resolveVatDate("expense", date, selection, year, period);
  const error = vatDateError("expense", date, vatDate);
  return <div className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
    <label>Btw-tijdvak<select className="input" value={!selection ? "auto" : selection === "invoice" ? "invoice" : "custom"}
      onChange={(event) => onChange(event.target.value === "auto" ? "" : event.target.value === "invoice" ? "invoice" : vatDate)}>
      <option value="auto">Voorstel voor de te doen aangifte</option>
      <option value="invoice">Oorspronkelijke factuurdatum</option>
      <option value="custom">Zelf een btw-datum kiezen</option>
    </select></label>
    <label>Btw-datum<input className="input" type="date" required value={vatDate} min={date}
      max={`${date.slice(0, 4)}-12-31`} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} /></label>
    <span className="text-xs font-normal text-[var(--muted)]">{error || (vatDate !== date
      ? `Btw in kwartaal ${Math.ceil(Number(vatDate.slice(5, 7)) / 3)} (${vatDate.slice(0, 4)}). Factuur en kosten blijven op ${date}.`
      : "Btw en kosten volgen de factuurdatum.")}</span>
    <span className="text-xs font-normal text-[var(--muted)]">Het voorstel gebruikt het gekozen kwartaal bovenaan; bij een heel jaar blijft de factuurdatum gelden. Controleer of dit de eerstvolgende aangifte is. Vergeten voorbelasting: totale correctie maximaal € 1.000; daarboven suppletie. Tel ook andere correcties mee.</span>
  </div>;
}
