export type ContactKind = "business" | "private";
export type ContactRole = "customer" | "supplier" | "entrepreneur";
export type Contact = {
  id: string;
  name: string;
  email: string;
  address: string;
  kvk: string;
  type: ContactRole;
  // Missing on older records. Keep their existing business presentation.
  kind?: ContactKind;
};
export type ContactDraft = Omit<Contact, "id" | "kind"> & { kind: ContactKind };
export const emptyContact: ContactDraft = { name: "", email: "", address: "", kvk: "", type: "customer", kind: "business" };
export const contactKind = (contact: { kind?: ContactKind }) => contact.kind === "private" ? "private" : "business";
export const contactKindLabel = (contact: { kind?: ContactKind }) => contactKind(contact) === "private" ? "Particulier" : "Onderneming";
export function contactTypeLabel(type: ContactRole) {
  return type === "customer" ? "Klant / debiteur" : type === "supplier" ? "Leverancier / crediteur" : "Klant en leverancier";
}
export function toContactDraft(contact: Contact): ContactDraft {
  return { name: contact.name, email: contact.email || "", address: contact.address || "", kvk: contact.kvk || "", type: contact.type, kind: contactKind(contact) };
}
export function createContact(draft: ContactDraft, id: string): Contact {
  return { id, name: draft.name.trim(), email: draft.email.trim(), address: draft.address.trim(), kvk: draft.kind === "private" ? "" : draft.kvk.trim(), type: draft.type, kind: draft.kind };
}
export function matchingContacts(contacts: Contact[], name: string) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-NL");
  return name.trim() ? contacts.filter((contact) => normalize(contact.name) === normalize(name)) : [];
}
