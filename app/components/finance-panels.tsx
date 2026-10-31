"use client";
import { formatDutchDate } from "../lib/dutch-date";
import { DutchDateInput } from "./dutch-date-input";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  calculateWkr, cents, euro, monthLabel, payrollOutstanding, payrollSections, payrollTotal,
  rcLedger, rcSections, salaryDeclarationProposal, syncDeclarationEntries,
  type FinanceAdministration, type FinanceEntry, type FinanceSection, type PayrollDeclaration, type WkrSettings,
} from "../lib/payroll-accounting";

const today = () => new Date().toLocaleDateString("sv-SE");
const monthNow = (year: number) => `${year}-${new Date().toLocaleDateString("sv-SE").slice(5, 7)}`;
const months = (year: number) => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
const numberValue = (value: string) => Number(value.replace(",", "."));
const newId = () => crypto.randomUUID();
type PdfCallback = (title: string, period: string, sections: FinanceSection[]) => void;
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-semibold">{label}{children}</label>;
}
function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-[var(--mint)] p-3 text-sm leading-6">{children}</p>;
}
function MonthSelect({ year, value, onChange }: { year: number; value: string; onChange: (value: string) => void }) {
  return <Field label="Maand"><select className="input" value={value} onChange={(event) => onChange(event.target.value)}>{months(year).map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></Field>;
}
function Amount({ label, value, onChange, signed = false }: { label: string; value: string; onChange: (value: string) => void; signed?: boolean }) {
  return <Field label={label}><input className="input" type="number" step="0.01" min={signed ? undefined : 0} required value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

export function PayrollTaxPanel({ admin, onChange, onProcess, onPdf }: {
  admin: FinanceAdministration; onChange: (next: FinanceAdministration) => void;
  onProcess: (declaration: PayrollDeclaration) => void; onPdf: PdfCallback;
}) {
  const [month, setMonth] = useState(monthNow(admin.fiscalYear));
  const declaration = (admin.payrollDeclarations ?? []).find((item) => item.period === month);
  const selectedSalaries = (admin.salaries ?? []).filter((salary) => salary.period === month);
  const proposal = salaryDeclarationProposal(admin.salaries ?? [], month);
  const save = (record: PayrollDeclaration) => {
    const declarations = [...(admin.payrollDeclarations ?? []).filter((item) => item.id !== record.id), record];
    onChange({ ...admin, payrollDeclarations: declarations, entries: syncDeclarationEntries(admin, record, Boolean(record.processed)) });
  };
  return <div className="mt-6 grid gap-5">
    <section className="panel"><h3 className="text-xl font-semibold">Aangifte loonheffingen</h3>
      <p className="my-3 text-sm text-[var(--muted)]">Leg de maandelijkse aangifte en betaling vast. Neem de definitieve bedragen uit je loonaangifte over. Indienen doe je via je aangiftesoftware of de Belastingdienst.</p>
      <div className="max-w-sm"><MonthSelect year={admin.fiscalYear} value={month} onChange={setMonth} /></div>
      <PayrollDeclarationForm key={`${month}-${declaration?.id ?? "new"}`} record={declaration} month={month} proposal={proposal} onSave={save} />
    </section>
    {declaration && <section className="panel grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">{[["Totaal aangifte", payrollTotal(declaration)], ["Betaald / ontvangen", cents(declaration.payments.reduce((total, payment) => total + payment.amount, 0))], ["Nog te betalen (+) / ontvangen (-)", payrollOutstanding(declaration)]].map(([label, value]) => <div className="rounded-xl bg-[var(--surface)] p-4" key={label}><p className="text-sm">{label}</p><strong className="text-xl">{euro(Number(value))}</strong></div>)}</div>
      <Notice>Loonbelasting en de ingehouden DGA-bijdrage Zvw zijn onderdeel van het brutoloon. De betaling wordt geboekt als aflossing van te betalen loonheffingen. Alleen aanvullende werkgeverslasten verhogen de kosten.</Notice>
      <p className="text-sm">{selectedSalaries.length} salarisregel(s) in dit tijdvak. Loonheffing voorstel {euro(proposal.wageTax)}, DGA-Zvw {euro(proposal.dgaZvw)} werkgevers-Zvw {euro(proposal.employerZvw)} en werknemersverzekeringen {euro(proposal.employeeInsurance)}.</p>
      <p className="text-sm">Verschil aangifte versus salarisregels: loonheffing {euro(declaration.wageTax - proposal.wageTax)}, DGA-Zvw {euro(declaration.dgaZvw - proposal.dgaZvw)}, werkgevers-Zvw {euro(declaration.employerZvw - proposal.employerZvw)}, werknemersverzekeringen {euro(declaration.employeeInsurance - proposal.employeeInsurance)}. Verklaar verschillen, bijvoorbeeld door correcties.</p>
      <div className="flex flex-wrap gap-2"><button className="primary-button" disabled={!selectedSalaries.length} onClick={() => onProcess(declaration)}>{declaration.processed ? "Boekingen opnieuw aansluiten" : "Verwerk salarissen en werkgeverslasten"}</button><button className="secondary-button" onClick={() => onPdf("Loonheffingen", monthLabel(month), payrollSections(declaration, admin.salaries ?? []))}>Download aangifteoverzicht PDF</button></div>
      {!selectedSalaries.length && <p className="text-sm text-[var(--muted)]">Voeg voor de kostenverwerking eerst de bijbehorende salarisregels toe onder Salarissen. Betalingen kun je alvast vastleggen.</p>}
      <p className="text-sm">Kostenverwerking: {declaration.processed ? "verwerkt" : "nog niet verwerkt"}. Correcties van eerdere tijdvakken worden als aangiftesaldo vastgelegd; corrigeer de oorspronkelijke salaris- of kostenboeking afzonderlijk.</p>
      <h4 className="font-semibold">Betalingen en teruggaven</h4>
      <PayrollPaymentForm key={declaration.id} onSave={(payment) => save({ ...declaration, payments: [...declaration.payments, { ...payment, id: newId() }] })} />
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Datum</th><th>Kenmerk</th><th>Bedrag</th><th>Actie</th></tr></thead><tbody>{declaration.payments.map((payment) => <tr key={payment.id}><td className="py-3">{formatDutchDate(payment.date)}</td><td>{payment.reference}</td><td>{euro(payment.amount)}</td><td><button className="ghost-button" onClick={() => save({ ...declaration, payments: declaration.payments.filter((item) => item.id !== payment.id) })}>Verwijder betaling</button></td></tr>)}</tbody></table></div>
    </section>}
    <section className="panel"><h3 className="text-lg font-semibold">Aangiften in {admin.fiscalYear}</h3><div className="mt-3 flex flex-wrap gap-2">{(admin.payrollDeclarations ?? []).filter((item) => item.period.startsWith(`${admin.fiscalYear}-`)).sort((a, b) => a.period.localeCompare(b.period)).map((item) => <button className="secondary-button" key={item.id} onClick={() => setMonth(item.period)}>{monthLabel(item.period)} · open {euro(payrollOutstanding(item))}</button>)}</div></section>
  </div>;
}
function PayrollDeclarationForm({ record, month, proposal, onSave }: { record?: PayrollDeclaration; month: string; proposal: { wageTax: number; dgaZvw: number; employerZvw: number; employeeInsurance: number }; onSave: (record: PayrollDeclaration) => void }) {
  const [values, setValues] = useState({ wageTax: String(record?.wageTax ?? proposal.wageTax), dgaZvw: String(record?.dgaZvw ?? proposal.dgaZvw), employerZvw: String(record?.employerZvw ?? proposal.employerZvw), employeeInsurance: String(record?.employeeInsurance ?? proposal.employeeInsurance), endLevy: String(record?.endLevy ?? 0), correction: String(record?.correction ?? 0) });
  const [reference, setReference] = useState(record?.reference ?? "");
  const [filedDate, setFiledDate] = useState(record?.filedDate ?? "");
  const [saved, setSaved] = useState(false);
  return <form className="mt-4 grid gap-3" onSubmit={(event) => {
    event.preventDefault();
    const numbers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numberValue(value)])) as typeof proposal & { employeeInsurance: number; endLevy: number; correction: number };
    if (!Object.values(numbers).every(Number.isFinite)) return;
    onSave({ ...numbers, id: record?.id ?? newId(), period: month, reference: reference.trim(), filedDate, payments: record?.payments ?? [], processed: record?.processed }); setSaved(true);
  }}>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{([["wageTax", "Loonbelasting / premie volksverzekeringen"], ["dgaZvw", "Ingehouden bijdrage Zvw DGA"], ["employerZvw", "Werkgeversheffing Zvw"], ["employeeInsurance", "Premies werknemersverzekeringen"], ["endLevy", "Eindheffingen, waaronder WKR"], ["correction", "Saldo correcties eerdere tijdvakken (+/-)"]] as const).map(([key, label]) => <Amount key={key} label={label} value={values[key]} signed onChange={(value) => { setValues({ ...values, [key]: value }); setSaved(false); }} />)}
      <Field label="Betaalkenmerk"><input className="input" value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
      <Field label="Datum ingediend (optioneel)"><DutchDateInput className="input"  value={filedDate} onChange={(event) => setFiledDate(event.target.value)} /></Field>
    </div><div className="flex flex-wrap items-center gap-3"><button className="primary-button">Aangifte opslaan</button>{<button type="button" className="secondary-button" onClick={() => setValues({ ...values, wageTax: String(proposal.wageTax), dgaZvw: String(proposal.dgaZvw), employerZvw: String(proposal.employerZvw), employeeInsurance: String(proposal.employeeInsurance) })}>Voorstel uit salarissen vernieuwen</button>}{saved && <span role="status" className="text-sm">Aangifte opgeslagen.</span>}</div>
  </form>;
}
function PayrollPaymentForm({ onSave }: { onSave: (payment: { date: string; amount: number; reference: string }) => void }) {
  const [date, setDate] = useState(today()); const [amount, setAmount] = useState(""); const [reference, setReference] = useState("");
  return <form className="grid items-end gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); const value = numberValue(amount); if (!Number.isFinite(value) || value === 0) return; onSave({ date, amount: value, reference }); setAmount(""); setReference(""); }}>
    <Field label="Betaaldatum"><DutchDateInput className="input"  value={date} required onChange={(event) => setDate(event.target.value)} /></Field><Amount label="Betaling (+) / teruggave (-)" signed value={amount} onChange={setAmount} /><Field label="Kenmerk / toelichting"><input className="input" value={reference} onChange={(event) => setReference(event.target.value)} /></Field><button className="primary-button">Betaling vastleggen</button>
  </form>;
}

export function WkrPanel({ admin, onChange, onPdf, onEntries }: { admin: FinanceAdministration; onChange: (next: FinanceAdministration) => void; onPdf: PdfCallback; onEntries: () => void }) {
  const settings = admin.wkrSettingsByYear?.[String(admin.fiscalYear)];
  const defaultRate = [2025, 2026].includes(admin.fiscalYear) ? 2 : 0;
  const initial = settings ?? { fiscalWage: 0, lowerRate: defaultRate, upperRate: defaultRate ? 1.18 : 0, threshold: 400000 };
  const [values, setValues] = useState(Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, String(value)])) as Record<keyof WkrSettings, string>);
  const overview = calculateWkr(admin.entries, admin.fiscalYear, settings ?? initial);
  const sections: FinanceSection[] = [{ title: "Vrije ruimte op jaarbasis", headers: ["Onderdeel", "Bedrag"], widths: [340, 171], rows: [["Fiscale loonsom", euro((settings ?? initial).fiscalWage)], ["Vrije ruimte", euro(overview.allowance)], ["Besteed aan vrije ruimte (inclusief btw)", euro(overview.used)], ["Resterend (+) / overschreden (-)", euro(overview.remaining)], ["Berekende eindheffing 80%", euro(overview.finalLevy)]] }, { title: "Aangewezen vergoedingen en verstrekkingen", headers: ["Datum", "Omschrijving", "Indeling", "Fiscale waarde"], widths: [70, 220, 110, 111], rows: overview.entries.map((entry) => [entry.date, entry.description, entry.wkrType === "free" ? "Vrije ruimte" : entry.wkrType === "exempt" ? "Gericht vrijgesteld" : "Nihilwaardering", euro(entry.wkrType === "nil" ? 0 : overview.value(entry))]), emptyText: "Nog geen WKR-posten aangewezen." }];
  return <div className="mt-6 grid gap-5"><section className="panel grid gap-4"><h3 className="text-xl font-semibold">Werkkostenregeling · {admin.fiscalYear}</h3>
    <Notice>De vrije ruimte geldt per kalenderjaar. In 2025 en 2026: 2% tot en met € 400.000 fiscale loonsom en 1,18% daarboven. Over een overschrijding geldt 80% eindheffing. Gebruik de fiscale loonsom uit de loonadministratie.</Notice>
    <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); const next = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numberValue(value)])) as WkrSettings; if (!Object.values(next).every((value) => Number.isFinite(value) && value >= 0) || next.lowerRate > 100 || next.upperRate > 100) return; onChange({ ...admin, wkrSettingsByYear: { ...admin.wkrSettingsByYear, [admin.fiscalYear]: next } }); }}>
      {([["fiscalWage", "Fiscale loonsom kalenderjaar"], ["threshold", "Grens eerste schijf"], ["lowerRate", "Percentage eerste schijf"], ["upperRate", "Percentage boven grens"]] as const).map(([key, label]) => <Amount key={key} label={label} value={values[key]} onChange={(value) => setValues({ ...values, [key]: value })} />)}<button className="primary-button md:col-span-2 xl:col-span-4 md:w-fit">WKR-instellingen opslaan</button>
    </form>
    {!settings && <p role="status" className="text-sm text-red-700">Leg eerst de fiscale loonsom en tarieven vast om de vrije ruimte te bepalen.{!defaultRate && " Voor dit jaar zijn geen standaardtarieven ingevuld."}</p>}
    <p className="text-sm text-[var(--muted)]">Ter vergelijking: opgeslagen bruto salarissen in dit jaar {euro((admin.salaries ?? []).filter((salary) => salary.period.startsWith(`${admin.fiscalYear}-`)).reduce((total, salary) => total + salary.grossSalary, 0))}. Bruto loon kan afwijken van fiscaal loon. Dit overzicht geldt voor deze administratie afzonderlijk.</p>
    <div className="grid gap-3 md:grid-cols-4">{[["Vrije ruimte", overview.allowance], ["Besteed", overview.used], ["Resterend / overschreden", overview.remaining], ["Eindheffing 80%", overview.finalLevy]].map(([label, amount]) => <div className="rounded-xl bg-[var(--surface)] p-4" key={label}><p className="text-sm">{label}</p><strong className="text-xl">{settings ? euro(Number(amount)) : "Nog niet bepaald"}</strong></div>)}</div>
    <p className="text-sm">Wijs kosten bij Boekingen toe aan vrije ruimte, gerichte vrijstelling of nihilwaardering. Controleer de voorwaarden en gebruikelijkheid. Een bonus is niet automatisch WKR-loon. De berekende eindheffing is een controlebedrag; neem de werkelijke eindheffing één keer over bij Loonheffingen. De WKR-indeling wijzigt de btw-aftrek niet: beoordeel die afzonderlijk.</p>
    <div className="flex flex-wrap gap-2"><button className="secondary-button" onClick={onEntries}>WKR-kosten boeken</button><button className="secondary-button" disabled={!settings} onClick={() => onPdf("WKR-jaaroverzicht", String(admin.fiscalYear), sections)}>Download WKR PDF</button></div>
  </section><section className="panel"><h3 className="text-lg font-semibold">WKR-posten</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Datum</th><th>Omschrijving</th><th>Indeling</th><th>Fiscale waarde</th></tr></thead><tbody>{overview.entries.map((entry) => <tr key={entry.id}><td className="py-3">{formatDutchDate(entry.date)}</td><td>{entry.description}</td><td>{entry.wkrType === "free" ? "Vrije ruimte" : entry.wkrType === "exempt" ? "Gericht vrijgesteld" : "Nihilwaardering"}</td><td>{euro(entry.wkrType === "nil" ? 0 : overview.value(entry))}</td></tr>)}</tbody></table>{!overview.entries.length && <p className="py-4 text-sm text-[var(--muted)]">Nog geen WKR-posten aangewezen.</p>}</div></section></div>;
}

export function RcPanel({ admin, onChange, onPdf, onEntries }: { admin: FinanceAdministration; onChange: (next: FinanceAdministration) => void; onPdf: PdfCallback; onEntries: () => void }) {
  const names = [...new Set([...admin.entries.map((entry) => entry.rcDga), ...(admin.salaries ?? []).map((salary) => salary.employeeName)].filter((name): name is string => Boolean(name)))];
  const [dga, setDga] = useState(names[0] ?? ""); const [month, setMonth] = useState(monthNow(admin.fiscalYear));
  const [date, setDate] = useState(today()); const [kind, setKind] = useState("private_expense"); const [amount, setAmount] = useState(""); const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<FinanceEntry | null>(null);
  const ledger = rcLedger(admin.entries, dga, month);
  const submit = (event: FormEvent) => {
    event.preventDefault(); const value = numberValue(amount); if (!dga.trim() || !Number.isFinite(value) || value === 0 || (kind !== "opening" && value < 0)) return;
    const effect = kind === "deposit" ? -value : value;
    const entry: FinanceEntry = { id: editing?.id ?? newId(), date, description: description.trim(), relation: dga.trim(), category: "Rekening-courant DGA", type: effect < 0 ? "income" : "expense", amount: Math.abs(value), vatRate: 0, status: "paid", paidDate: date, balanceOnly: true, cashAmount: kind === "opening" ? 0 : Math.abs(value), rcDga: dga.trim(), rcAmount: effect, rcKind: kind };
    onChange({ ...admin, entries: [entry, ...admin.entries.filter((item) => item.id !== entry.id)] }); setMonth(date.slice(0, 7)); setAmount(""); setDescription(""); setEditing(null);
  };
  return <div className="mt-6 grid gap-5"><section className="panel grid gap-4"><h3 className="text-xl font-semibold">Rekening-courant DGA</h3>
    <Notice>Positief saldo: de DGA heeft een schuld aan de BV. Negatief saldo: de BV heeft een schuld aan de DGA. Zakelijke kosten die de DGA privé betaalt boek je onder Boekingen met betaalwijze Rekening-courant DGA; de kosten en btw worden daar verwerkt.</Notice>
    <div className="grid gap-3 md:grid-cols-2"><Field label="Naam DGA"><input className="input" list="rc-dga-names" required value={dga} onChange={(event) => setDga(event.target.value)} /><datalist id="rc-dga-names">{names.map((name) => <option key={name} value={name} />)}</datalist></Field><MonthSelect year={admin.fiscalYear} value={month} onChange={setMonth} /></div>
    <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
      <Field label="Mutatie"><select className="input" value={kind} onChange={(event) => setKind(event.target.value)}><option value="private_expense">Privé-uitgave betaald door BV (+)</option><option value="withdrawal">BV betaalt / leent aan DGA (+)</option><option value="deposit">DGA betaalt / leent aan BV (-)</option><option value="opening">Beginsaldo / overboeking (+/-), zonder bank</option></select></Field>
      <Field label="Datum"><DutchDateInput className="input"  required value={date} onChange={(event) => setDate(event.target.value)} /></Field><Amount label={kind === "opening" ? "Saldo (+ schuld DGA / - schuld BV)" : "Bedrag inclusief btw"} value={amount} onChange={setAmount} signed={kind === "opening"} /><Field label="Omschrijving / onderbouwing"><input className="input" required maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <div className="flex flex-wrap gap-2 md:col-span-2"><button className="primary-button" disabled={!dga.trim()}>{editing ? "Mutatie wijzigen" : "Mutatie vastleggen"}</button>{editing && <button className="secondary-button" type="button" onClick={() => { setEditing(null); setAmount(""); setDescription(""); }}>Annuleren</button>}</div>
    </form><p className="text-sm text-[var(--muted)]">Deze mutaties zijn balansposten, zonder omzet, kosten of btw-aftrek. Boek rente afzonderlijk volgens de rekening-courantafspraken. Leg een bestaand beginsaldo één keer vast vóór de eerste maand die je wilt controleren.</p>
    <div className="flex flex-wrap gap-2"><button className="secondary-button" onClick={onEntries}>Zakelijke kosten via DGA boeken</button><button className="secondary-button" disabled={!dga.trim()} onClick={() => onPdf("Rekening-courant DGA", monthLabel(month), rcSections(admin.entries, dga, month))}>Download maandoverzicht PDF</button></div>
  </section><section className="panel"><div className="flex flex-wrap justify-between gap-3"><h3 className="text-lg font-semibold">{dga || "Kies een DGA"} · {monthLabel(month)}</h3><p>Beginsaldo <strong>{euro(ledger.opening)}</strong> · Eindsaldo <strong>{euro(ledger.closing)}</strong></p></div>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Datum</th><th>Omschrijving</th><th>Debet DGA (+)</th><th>Credit DGA (-)</th><th>Saldo</th><th>Actie</th></tr></thead><tbody>{ledger.rows.map(({ entry, effect, balance }) => <tr key={entry.id}><td className="py-3 pr-3">{formatDutchDate(entry.date)}</td><td className="pr-3">{entry.description}</td><td>{effect > 0 ? euro(effect) : "-"}</td><td>{effect < 0 ? euro(-effect) : "-"}</td><td>{euro(balance)}</td><td>{entry.balanceOnly ? <div className="flex gap-2"><button className="ghost-button" onClick={() => { setEditing(entry); setDate(entry.date); setKind(entry.rcKind ?? "opening"); setDescription(entry.description); setAmount(String(entry.rcKind === "opening" ? entry.rcAmount : entry.amount)); }}>Bewerk</button><button className="ghost-button" onClick={() => onChange({ ...admin, entries: admin.entries.filter((item) => item.id !== entry.id) })}>Verwijder</button></div> : "Via Boekingen"}</td></tr>)}</tbody></table>{!ledger.rows.length && <p className="py-4 text-sm text-[var(--muted)]">Geen mutaties in deze maand.</p>}</div>
  </section></div>;
}
