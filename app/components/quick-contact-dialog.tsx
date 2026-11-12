"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ContactFields } from "./contact-fields";
import { contactKindLabel, emptyContact, matchingContacts, type Contact, type ContactDraft, type ContactRole } from "../lib/contacts";

export function QuickContactDialog({ initialName, role, contacts, onSave, onSelect, onClose }: {
  initialName: string;
  role: ContactRole;
  contacts: Contact[];
  onSave: (draft: ContactDraft) => void;
  onSelect: (contact: Contact) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ContactDraft>({ ...emptyContact, name: initialName, type: role });
  const [error, setError] = useState("");
  const existing = matchingContacts(contacts, form.name);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) { setError("Vul de naam van de relatie in."); return; }
    if (existing.length) { setError("Deze naam bestaat al. Selecteer de bestaande relatie of maak de naam onderscheidend, bijvoorbeeld met een plaatsnaam."); return; }
    onSave(form);
  };
  return <dialog ref={dialog} className="workspace-native-dialog" aria-labelledby="quick-contact-title" aria-describedby="quick-contact-description" onCancel={onClose}>
    <section className="workspace-modal">
      <div className="section-title"><div><p className="eyebrow">Tijdens het inboeken</p><h2 id="quick-contact-title">{role === "customer" ? "Debiteur toevoegen" : "Leverancier toevoegen"}</h2></div><button type="button" className="icon-button" aria-label="Sluiten" onClick={onClose}>×</button></div>
      <p id="quick-contact-description" className="my-4 text-sm text-[var(--muted)]">Je factuur blijft ingevuld. Na opslaan wordt deze relatie direct geselecteerd.</p>
      <form onSubmit={submit} className="grid gap-4">
        <ContactFields value={form} onChange={(value) => { setForm(value); setError(""); }} focusName fixedRole />
        {existing.length > 0 && <div className="notice"><p className="text-sm font-semibold">Deze naam staat al in je adresboek</p>{existing.map((contact) => <div key={contact.id} className="mt-2 grid gap-1 text-sm"><span>{contact.name} · {contactKindLabel(contact)}{contact.address ? ` · ${contact.address}` : ""}</span><button className="secondary-button" type="button" onClick={() => onSelect(contact)}>{contact.type === role || contact.type === "entrepreneur" ? "Gebruik bestaande relatie" : role === "customer" ? "Ook gebruiken als debiteur" : "Ook gebruiken als leverancier"}</button></div>)}</div>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-between gap-3"><button className="secondary-button" type="button" onClick={onClose}>Annuleren</button><button className="primary-button" type="submit">Opslaan en selecteren</button></div>
      </form>
    </section>
  </dialog>;
}
