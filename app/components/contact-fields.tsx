"use client";
import type { ReactNode } from "react";
import type { ContactDraft, ContactKind, ContactRole } from "../lib/contacts";

export function ContactFields({ value, onChange, businessSearch, focusName = false, fixedRole = false }: {
  value: ContactDraft;
  onChange: (value: ContactDraft) => void;
  businessSearch?: ReactNode;
  focusName?: boolean;
  fixedRole?: boolean;
}) {
  const update = (patch: Partial<ContactDraft>) => onChange({ ...value, ...patch });
  const privatePerson = value.kind === "private";
  return <div className="grid gap-4">
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Wie is de relatie?</legend>
      <div className="segmented-control contact-kind-control">
        {([["business", "Onderneming"], ["private", "Particulier"]] as [ContactKind, string][]).map(([kind, label]) => <button key={kind} type="button" aria-pressed={value.kind === kind} className={value.kind === kind ? "is-active" : ""} onClick={() => update({ kind })}>{label}</button>)}
      </div>
    </fieldset>
    <label className="grid gap-1 text-sm font-semibold">{privatePerson ? "Volledige naam" : "Bedrijfsnaam"}<input className="input" required autoFocus={focusName} autoComplete={privatePerson ? "name" : "organization"} placeholder={privatePerson ? "Bijv. Jan de Vries" : "Bijv. De Vries B.V."} value={value.name} onChange={(event) => update({ name: event.target.value })} /></label>
    <p className="text-xs text-[var(--muted)]">{privatePerson ? "Voor een particulier is geen KvK-nummer nodig. Alleen de naam is verplicht." : "Alleen de bedrijfsnaam is verplicht. Je kunt de overige gegevens later aanvullen."}</p>
    {!privatePerson && businessSearch}
    <label className="grid gap-1 text-sm font-semibold">E-mailadres (optioneel)<input className="input" type="email" autoComplete="email" value={value.email} onChange={(event) => update({ email: event.target.value })} /></label>
    <label className="grid gap-1 text-sm font-semibold">{privatePerson ? "Adres (optioneel)" : "Vestigingsadres (optioneel)"}<input className="input" autoComplete="street-address" value={value.address} onChange={(event) => update({ address: event.target.value })} /></label>
    {!privatePerson && <label className="grid gap-1 text-sm font-semibold">KvK-nummer (optioneel)<input className="input" value={value.kvk} onChange={(event) => update({ kvk: event.target.value })} /></label>}
    <label className="grid gap-1 text-sm font-semibold">Rol in de administratie<select className="input" disabled={fixedRole} value={value.type} onChange={(event) => update({ type: event.target.value as ContactRole })}><option value="customer">Klant / debiteur</option><option value="supplier">Leverancier / crediteur</option><option value="entrepreneur">Klant en leverancier</option></select></label>
  </div>;
}
