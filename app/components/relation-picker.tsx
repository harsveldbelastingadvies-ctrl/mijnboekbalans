"use client";
import { useId } from "react";
import { contactKind, contactKindLabel, contactTypeLabel, type Contact } from "../lib/contacts";

export function RelationPicker({ value, onChange, onAdd, contacts, role }: {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  contacts: Contact[];
  role: "customer" | "supplier";
}) {
  const listId = useId();
  const customer = role === "customer";
  const options = contacts.filter((contact) => contact.type === role || contact.type === "entrepreneur");
  return <div className="grid content-start gap-1">
    <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">{customer ? "Debiteur / klant" : "Leverancier"}<input className="input" list={listId} placeholder={customer ? "Kies of typ een debiteur" : "Kies of typ een leverancier"} value={value} onChange={(event) => onChange(event.target.value)} /></label>
    <button className="inline-contact-button" type="button" onClick={onAdd}>{customer ? "+ Debiteur toevoegen" : "+ Leverancier toevoegen"}</button>
    <datalist id={listId}>{options.map((contact) => <option key={contact.id} value={contact.name}>{contactKindLabel(contact)} · {contactTypeLabel(contact.type)}{contactKind(contact) === "business" && contact.kvk ? ` · KvK ${contact.kvk}` : ""}</option>)}</datalist>
  </div>;
}
