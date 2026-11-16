import { getNextInvoiceNumber, hasDuplicateSalesInvoice, incrementInvoiceNumber } from "./invoice-numbering.ts";
export type InvoiceParty = {
    name: string;
    address: string;
    vatNumber: string;
    kvk: string;
    iban: string;
    accountName: string;
    email: string;
    phone: string;
};
export type NewSalesLine = {
    id: string;
    description: string;
    quantity: string;
    price: string;
    vatRate: string;
    category: string;
};
export type SalesInvoiceDraft = {
    id: string;
    date: string;
    deliveryDate: string;
    dueDate: string;
    customerName: string;
    customerAddress: string;
    prices: "inclusive" | "exclusive";
    zeroVatConfirmed: boolean;
    lines: NewSalesLine[];
    issuer: InvoiceParty;
    closing: string;
};
export type IssuedSalesLine = {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitNet: number;
    vatRate: number;
    category: string;
    net: number;
    vat: number;
    gross: number;
};
export type IssuedSalesInvoice = {
    id: string;
    documentId: string;
    version: 1;
    number: string;
    date: string;
    deliveryDate: string;
    dueDate: string;
    createdAt: string;
    customerName: string;
    customerAddress: string;
    issuer: InvoiceParty;
    prices: "inclusive" | "exclusive";
    closing: string;
    lines: IssuedSalesLine[];
    net: number;
    vat: number;
    gross: number;
};
export type IssuedInvoiceEntry = {
    id: string;
    issuedInvoiceId: string;
    documentId: string;
    type: "income";
    date: string;
    invoiceNumber: string;
    relation: string;
    description: string;
    category: string;
    amount: number;
    vatRate: number;
    invoiceVatAmount: number;
    status: "open";
};
export type InvoiceAdministration = {
    id: string;
    fiscalYear: number;
    nextInvoiceNumber?: string;
    entries: Array<{
        id: string;
        type: string;
        date: string;
        invoiceNumber?: string;
    }>;
    issuedSalesInvoices?: IssuedSalesInvoice[];
};
const round = (n: number) => Math.round((n + Number.EPSILON) * 100);
const text = (v: unknown, label: string, max = 200, required = true) => { if (typeof v !== "string" || v.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v) || required && !v.trim())
    throw Error(`Vul ${label} in (maximaal ${max} tekens).`); return v.trim(); };
const validDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 1900 && Number(s.slice(0, 4)) <= 2200 && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const decimal = (v: unknown, digits: number) => { if (typeof v !== "string" || !new RegExp(`^\\d{1,9}(?:[.,]\\d{1,${digits}})?$`).test(v.trim()))
    return NaN; return Number(v.trim().replace(",", ".")); };
export function invoiceDateAfter(date: string, days = 14) { return validDate(date) ? new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10) : ""; }
export function validInvoiceIban(iban: string) {
    const clean = iban.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean))
        return false;
    let mod = 0;
    for (const c of clean.slice(4) + clean.slice(0, 4))
        for (const d of /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)
            mod = (mod * 10 + Number(d)) % 97;
    return mod === 1;
}
// Deterministic, cent-exact allocation; the VAT group closes even for prices including VAT.
function allocate(total: number, weights: number[]) {
    const sum = weights.reduce((s, n) => s + n, 0), raw = weights.map(n => total * n / sum), result = raw.map(Math.floor);
    const order = raw.map((n, i) => ({ i, remainder: n - result[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
    const remaining = total - result.reduce((s, n) => s + n, 0);
    for (let i = 0; i < remaining; i++)
        result[order[i].i]++;
    return result;
}
export function calculateNewSalesLines(draft: Pick<SalesInvoiceDraft, "lines" | "prices">): IssuedSalesLine[] {
    if (!Array.isArray(draft.lines) || !draft.lines.length || draft.lines.length > 100)
        throw Error("Gebruik 1 tot 100 factuurregels.");
    if (!["inclusive", "exclusive"].includes(draft.prices))
        throw Error("Kies prijzen inclusief of exclusief btw.");
    const ids = new Set<string>();
    const lines = draft.lines.map((line, index) => {
        const id = text(line.id, "regelkenmerk", 80);
        if (ids.has(id))
            throw Error("Een factuurregel staat dubbel in het concept.");
        ids.add(id);
        const quantity = decimal(line.quantity, 3), price = decimal(line.price, 4), rate = Number(line.vatRate);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || !Number.isFinite(price) || price <= 0 || ![0, 9, 21].includes(rate))
            throw Error(`Regel ${index + 1}: vul een positief aantal, prijs en Nederlands btw-tarief in.`);
        const value = round(quantity * price);
        if (value < 1 || value > 999999999)
            throw Error(`Regel ${index + 1}: het bedrag is te klein of te groot.`);
        return { id, description: text(line.description, `de omschrijving bij regel ${index + 1}`, 2000), quantity, unitPrice: price, unitNet: draft.prices === "inclusive" ? price / (1 + rate / 100) : price, vatRate: rate, category: text(line.category, "een omzetcategorie", 100), net: draft.prices === "exclusive" ? value : 0, vat: 0, gross: draft.prices === "inclusive" ? value : 0 };
    });
    for (const rate of [0, 9, 21]) {
        const group = lines.filter(l => l.vatRate === rate);
        if (!group.length)
            continue;
        const weights = group.map(l => draft.prices === "inclusive" ? l.gross : l.net), sum = weights.reduce((a, n) => a + n, 0);
        const vat = Math.round(draft.prices === "inclusive" ? sum * rate / (100 + rate) : sum * rate / 100), shares = allocate(vat, weights);
        group.forEach((l, i) => { l.vat = shares[i]; if (draft.prices === "inclusive")
            l.net = l.gross - l.vat;
        else
            l.gross = l.net + l.vat; });
    }
    return lines.map(l => ({ ...l, net: l.net / 100, vat: l.vat / 100, gross: l.gross / 100 }));
}
export function prepareSalesInvoice(admin: InvoiceAdministration, draft: SalesInvoiceDraft, documentId: string, createdAt: string) {
    if (!draft || typeof draft !== "object" || typeof draft.id !== "string" || !/^[0-9a-f-]{36}$/i.test(draft.id))
        throw Error("Het concept heeft geen geldig kenmerk.");
    if (!validDate(draft.date) || Number(draft.date.slice(0, 4)) !== admin.fiscalYear)
        throw Error("Kies een factuurdatum binnen het actieve boekjaar.");
    if (!validDate(draft.deliveryDate))
        throw Error("Vul de leveringsdatum of datum van vooruitbetaling in.");
    if (!validDate(draft.dueDate) || draft.dueDate < draft.date)
        throw Error("De vervaldatum mag niet vóór de factuurdatum liggen.");
    const input = draft.issuer;
    if (!input || typeof input !== "object")
        throw Error("Vul de afzendergegevens in.");
    const issuer: InvoiceParty = { name: text(input.name, "de afzendernaam"), address: text(input.address, "het vestigingsadres", 600), vatNumber: text(input.vatNumber, "het btw-identificatienummer", 30).replace(/\s/g, "").toUpperCase(), kvk: text(input.kvk, "het KvK-nummer", 8, false), iban: text(input.iban, "het IBAN", 50).replace(/\s/g, "").toUpperCase(), accountName: text(input.accountName, "de naam van de rekeninghouder"), email: text(input.email, "het e-mailadres", 200, false), phone: text(input.phone, "het telefoonnummer", 50, false) };
    if (!/^NL\d{9}B\d{2}$/.test(issuer.vatNumber))
        throw Error("Vul een Nederlands btw-identificatienummer in (NL, 9 cijfers, B en 2 cijfers).");
    if (issuer.kvk && !/^\d{8}$/.test(issuer.kvk))
        throw Error("Een KvK-nummer bestaat uit 8 cijfers.");
    if ([issuer.address, draft.customerAddress].some(a => typeof a !== "string" || a.split("\n").length > 8))
        throw Error("Gebruik maximaal 8 regels per adres.");
    if (!validInvoiceIban(issuer.iban))
        throw Error("Vul een geldig IBAN in.");
    const lines = calculateNewSalesLines(draft);
    if (lines.some(l => l.vatRate === 0) && draft.zeroVatConfirmed !== true)
        throw Error("Bevestig dat de 0%-regels Nederlandse 0%-omzet betreffen.");
    const reservationEntries = [...admin.entries, ...(admin.issuedSalesInvoices ?? []).map(i => ({ id: i.id, type: "income", date: i.date, invoiceNumber: i.number }))];
    const number = getNextInvoiceNumber({ ...admin, entries: reservationEntries });
    if (hasDuplicateSalesInvoice(reservationEntries, number))
        throw Error("Dit factuurnummer bestaat al.");
    const totals = lines.reduce((s, l) => ({ net: s.net + round(l.net), vat: s.vat + round(l.vat), gross: s.gross + round(l.gross) }), { net: 0, vat: 0, gross: 0 });
    const invoice: IssuedSalesInvoice = { id: draft.id, documentId, version: 1, number, date: draft.date, deliveryDate: draft.deliveryDate, dueDate: draft.dueDate, createdAt, customerName: text(draft.customerName, "de klantnaam"), customerAddress: text(draft.customerAddress, "het klantadres", 600), issuer, prices: draft.prices, closing: text(draft.closing, "de afsluiting", 1500, false), lines, net: totals.net / 100, vat: totals.vat / 100, gross: totals.gross / 100 };
    const entries: IssuedInvoiceEntry[] = lines.map((l, i) => ({ id: `${invoice.id}:${i + 1}`, issuedInvoiceId: invoice.id, documentId, type: "income", date: invoice.date, invoiceNumber: number, relation: invoice.customerName, description: l.description, category: l.category, amount: l.net, vatRate: l.vatRate, invoiceVatAmount: l.vat, status: "open" }));
    return { invoice, entries, nextInvoiceNumber: incrementInvoiceNumber(number) };
}
export function issuedInvoiceChangesError(previous: Array<{
    id: string;
    issuedSalesInvoices?: IssuedSalesInvoice[];
    entries: unknown[];
}>, next: Array<{
    id: string;
    issuedSalesInvoices?: IssuedSalesInvoice[];
    entries: unknown[];
}>) {
    for (const admin of next)
        if (admin.issuedSalesInvoices?.some(i => !previous.find(a => a.id === admin.id)?.issuedSalesInvoices?.some(old => old.id === i.id)))
            return "Gebruik Verkoopfacturen maken om een factuur definitief vast te leggen.";
    for (const old of previous)
        for (const invoice of old.issuedSalesInvoices ?? []) {
            const target = next.find(a => a.id === old.id), copy = target?.issuedSalesInvoices?.find(i => i.id === invoice.id);
            if (!copy || JSON.stringify(invoice) !== JSON.stringify(copy))
                return "Een definitieve verkoopfactuur mag niet worden verwijderd of gewijzigd. Bewaar de factuur en maak een afzonderlijke correctie.";
            for (const line of invoice.lines) {
                const id = `${invoice.id}:${invoice.lines.indexOf(line) + 1}`;
                const before = old.entries.find(e => (e as {
                    id: string;
                }).id === id), after = target?.entries.find(e => (e as {
                    id: string;
                }).id === id);
                const signature = (v: unknown) => JSON.stringify(Object.entries(v as Record<string, unknown>).filter(([k, value]) => value !== undefined && !["status", "paidDate", "bankPaymentIds", "bankPayments", "category"].includes(k)).sort(([a], [b]) => a.localeCompare(b)));
                if (!before || !after || signature(before) !== signature(after))
                    return "De boekingsregels van een definitieve verkoopfactuur moeten behouden blijven. Verwerk de betaling of maak een afzonderlijke correctie.";
            }
        }
    return "";
}
