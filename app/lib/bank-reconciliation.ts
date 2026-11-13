import { invoicedVat, type SalesEntry } from "./international-vat.ts";
import { spreadsheetDate, spreadsheetInvoiceKey } from "./spreadsheet-invoices.ts";

export type BankAllocation = { transactionId: string; invoiceKey: string; amount: number };
export type SavedBankAllocation = { invoiceKey: string; invoiceNumber: string; amount: number; entryIds: string[] };
export type BankTransaction = {
  id: string; date: string; amount: number | null; currency: string; description: string;
  counterparty: string; bankId: string; page: number; allocations?: SavedBankAllocation[];
  overlapReviewed?: boolean;
};
export type BankStatement = {
  id: string; documentId: string; fileName: string; account: string; currency: string;
  openingBalance: number | null; closingBalance: number | null; transactions: BankTransaction[];
  complete: boolean; verified: boolean; note: string;
};
export type ReconciliationEntry = SalesEntry & {
  id: string; description: string; relation: string; status: "open" | "paid"; paidDate?: string;
  bankPaymentIds?: string[];
  bankPayments?: Array<{ transactionId: string; date: string; amount: number; vatAmount: number }>;
};
export type PaymentInvoice = { key: string; invoiceNumber: string; date: string; relation: string; amount: number; entryIds: string[]; error: string };
export const bankCents = (amount: number) => Math.round((amount + Math.sign(amount) * 1e-8) * 100);
const validMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(bankCents(value)) && Math.abs(value * 100 - bankCents(value)) < 1e-6;
const clean = (value: unknown, length = 2000) => typeof value === "string" ? value.trim().slice(0, length) : "";
export const normalizeBankAccount = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function normalizeBankStatement(value: unknown, source: { digest: string; documentId: string; fileName: string }): BankStatement {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!Array.isArray(record.transactions) || record.transactions.length > 500) throw new Error("Een afschrift mag maximaal 500 transacties bevatten. Splits grotere afschriften op.");
  return { id: source.digest, documentId: source.documentId, fileName: source.fileName, account: normalizeBankAccount(clean(record.account, 80)), currency: clean(record.currency, 10).toUpperCase(),
    openingBalance: validMoney(record.openingBalance) ? record.openingBalance : null, closingBalance: validMoney(record.closingBalance) ? record.closingBalance : null,
    complete: record.complete === true, verified: false, note: clean(record.note),
    transactions: record.transactions.map((raw, index) => {
      const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return { id: `${source.digest}:${index}`, date: spreadsheetDate(clean(row.date, 30)), amount: validMoney(row.amount) ? row.amount : null,
        currency: clean(row.currency, 10).toUpperCase(), description: clean(row.description), counterparty: clean(row.counterparty, 300), bankId: /^(?:NOTPROVIDED|unknown|onbekend|n\/a|-|0)$/i.test(clean(row.bankId, 200)) ? "" : clean(row.bankId, 200),
        page: Number.isInteger(row.page) && Number(row.page) > 0 && Number(row.page) <= 500 ? Number(row.page) : 0 };
    }) };
}
export function bankTransactionErrors(transaction: BankTransaction) {
  const errors: string[] = [];
  if (!spreadsheetDate(transaction.date)) errors.push("Ongeldige of ontbrekende bankdatum.");
  if (!validMoney(transaction.amount) || transaction.amount === 0) errors.push("Vul een getekend bedrag met maximaal twee decimalen in (bijschrijving positief, afschrijving negatief).");
  if (transaction.currency !== "EUR") errors.push("Alleen EUR wordt ondersteund; er wordt geen valuta omgerekend.");
  if (!transaction.description.trim()) errors.push("Omschrijving ontbreekt.");
  if (!Number.isInteger(transaction.page) || transaction.page < 1) errors.push("Bronpagina ontbreekt.");
  return errors;
}
export function bankStatementErrors(statement: BankStatement) {
  const errors: string[] = [];
  if (!statement.account.trim()) errors.push("Rekeningnummer van het afschrift ontbreekt.");
  if (statement.currency !== "EUR") errors.push("Het afschrift moet in EUR luiden.");
  if (!statement.transactions.length) errors.push("Nog geen transacties. Vul de mutaties uit het PDF-afschrift aan.");
  if (statement.transactions.length > 500) errors.push("Splits het afschrift in bestanden met maximaal 500 transacties.");
  if (new Set(statement.transactions.map((row) => row.id)).size !== statement.transactions.length) errors.push("Dubbele transactie-identificatie binnen het afschrift.");
  if (statement.transactions.some((row) => bankTransactionErrors(row).length)) errors.push("Vul de ongeldige transacties aan voordat je het afschrift bevestigt.");
  if (statement.openingBalance !== null && !validMoney(statement.openingBalance) || statement.closingBalance !== null && !validMoney(statement.closingBalance)) errors.push("Ongeldig begin- of eindsaldo.");
  if (validMoney(statement.openingBalance) && validMoney(statement.closingBalance) && statement.transactions.every((row) => validMoney(row.amount))) {
    const movement = statement.transactions.reduce((sum, row) => sum + bankCents(row.amount!), 0);
    if (bankCents(statement.openingBalance) + movement !== bankCents(statement.closingBalance)) errors.push("Beginsaldo + bijschrijvingen - afschrijvingen sluit niet aan op het eindsaldo. Controleer ontbrekende of dubbel herkende regels.");
  }
  return errors;
}
export function paymentInvoices(entries: ReconciliationEntry[]): PaymentInvoice[] {
  const groups = new Map<string, ReconciliationEntry[]>();
  for (const entry of entries) {
    if (entry.type !== "income" || !entry.invoiceNumber?.trim() || entry.balanceOnly || entry.salaryRecordId || entry.payrollDeclarationId) continue;
    const key = spreadsheetInvoiceKey(entry.invoiceNumber);
    groups.set(key, [...groups.get(key) ?? [], entry]);
  }
  return [...groups].flatMap(([key, rows]) => {
    if (rows.every((row) => row.status === "paid")) return [];
    const first = rows[0];
    const amount = rows.reduce((sum, row) => sum + bankCents(row.amount + invoicedVat(row)), 0) / 100;
    return [{ key, invoiceNumber: first.invoiceNumber!, date: first.date, relation: first.relation, amount, entryIds: rows.map((row) => row.id),
      error: rows.some((row) => row.status !== "open" || row.date !== first.date || row.relation !== first.relation || row.bankPaymentIds?.length) ? "Factuurregels hebben verschillende datums, klanten of betaalstatussen, of zijn al gekoppeld." : !validMoney(amount) || amount === 0 ? "Geen geldig open factuurtotaal." : "" }];
  });
}
const referencePattern = (number: string) => new RegExp(`(?:^|[^a-z0-9/_.-])${number.trim().split(/[\s./_-]+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s./_-]*")}(?![a-z0-9]|[/_.-][a-z0-9])`, "i");
const normalizedName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function namesMatch(a: string, b: string) {
  const left = normalizedName(a), right = normalizedName(b);
  return left.length >= 6 && right.length >= 6 && (left.includes(right) || right.includes(left));
}
export function proposeBankAllocations(invoices: PaymentInvoice[], transactions: BankTransaction[]) {
  const open = invoices.filter((invoice) => !invoice.error);
  const available = transactions.filter((row) => !row.allocations?.length && !bankTransactionErrors(row).length);
  const result: BankAllocation[] = [], usedTransactions = new Set<string>(), usedInvoices = new Set<string>();
  const patterns = open.filter((invoice) => invoice.invoiceNumber.replace(/[^a-z0-9]/gi, "").length >= 4 && /\d/.test(invoice.invoiceNumber)).map((invoice) => ({ invoice, pattern: referencePattern(invoice.invoiceNumber) }));
  const references = new Map(available.map((row) => [row.id, patterns.filter(({ pattern }) => pattern.test(row.description)).map(({ invoice }) => invoice)]));
  // Several payments with one invoice reference are proposed only if their entire sum closes the invoice.
  for (const invoice of open) {
    const referencedRows = available.filter((row) => references.get(row.id)?.length === 1 && references.get(row.id)![0].key === invoice.key);
    const rows = referencedRows.filter((row) => Math.sign(row.amount!) === Math.sign(invoice.amount) && row.date >= invoice.date);
    if (rows.length && rows.length === referencedRows.length && rows.reduce((sum, row) => sum + bankCents(row.amount!), 0) === bankCents(invoice.amount)) {
      for (const row of rows) { result.push({ transactionId: row.id, invoiceKey: invoice.key, amount: row.amount! }); usedTransactions.add(row.id); }
      usedInvoices.add(invoice.key);
    }
  }
  // One bank payment can explicitly mention several invoices.
  for (const row of available) {
    const targets = references.get(row.id)!;
    if (!usedTransactions.has(row.id) && targets.length > 1 && targets.every((invoice) => !usedInvoices.has(invoice.key) && row.date >= invoice.date && Math.sign(invoice.amount) === Math.sign(row.amount!)) && targets.reduce((sum, invoice) => sum + bankCents(invoice.amount), 0) === bankCents(row.amount!)) {
      for (const invoice of targets) { result.push({ transactionId: row.id, invoiceKey: invoice.key, amount: invoice.amount }); usedInvoices.add(invoice.key); }
      usedTransactions.add(row.id);
    }
  }
  // Amount alone never produces a link. Both directions must have one unambiguous name + amount match.
  const nameCandidates = available.filter((row) => !usedTransactions.has(row.id) && !references.get(row.id)!.length && !/\d{3,}|\b(?:factuur|invoice|fact\.?|inv\.?)\s*[:#-]?\s*\d/i.test(row.description)).map((row) => ({ row, candidates: open.filter((invoice) => !usedInvoices.has(invoice.key) && row.date >= invoice.date && bankCents(invoice.amount) === bankCents(row.amount!) && namesMatch(invoice.relation, row.counterparty)) }));
  for (const item of nameCandidates) {
    if (item.candidates.length !== 1) continue;
    const invoice = item.candidates[0];
    if (nameCandidates.filter((other) => other.candidates.some((candidate) => candidate.key === invoice.key)).length !== 1) continue;
    result.push({ transactionId: item.row.id, invoiceKey: invoice.key, amount: item.row.amount! });
  }
  return result;
}
export function bankOverlapErrors(stored: BankStatement[], incoming: BankStatement[], acceptedSimilarIds: string[] = []) {
  const errors: string[] = [], seen = stored.flatMap((statement) => statement.transactions.map((row) => ({ account: normalizeBankAccount(statement.account), statementId: statement.id, row })));
  const ids = new Set(stored.map((statement) => statement.id));
  for (const statement of incoming) {
    if (ids.has(statement.id)) { errors.push(`${statement.fileName}: dit afschrift is al geïmporteerd.`); continue; }
    ids.add(statement.id);
    for (const row of statement.transactions) {
      const account = normalizeBankAccount(statement.account);
      const same = seen.filter((other) => other.account === account);
      if (row.bankId && same.some((other) => other.row.bankId === row.bankId)) errors.push(`${row.id}: banktransactie-ID bestaat al; controleer het originele afschrift.`);
      else if (!acceptedSimilarIds.includes(row.id) && same.some((other) => (!row.bankId || !other.row.bankId) && other.statementId !== statement.id && other.row.date === row.date && other.row.amount === row.amount && other.row.currency === row.currency && normalizedName(other.row.description) === normalizedName(row.description) && normalizedName(other.row.counterparty) === normalizedName(row.counterparty))) errors.push(`${row.id}: mogelijk overlappend afschrift. Controleer of dit werkelijk een aparte betaling is.`);
      seen.push({ account, statementId: statement.id, row });
    }
  }
  return errors;
}
export function validateBankAllocations(invoices: PaymentInvoice[], transactions: BankTransaction[], allocations: BankAllocation[]) {
  const errors: string[] = [], pairs = new Set<string>(), transactionIds = new Set(transactions.map((row) => row.id));
  if (transactionIds.size !== transactions.length) errors.push("Transactie-ID komt meermaals voor.");
  for (const allocation of allocations) {
    const row = transactions.find((row) => row.id === allocation.transactionId), invoice = invoices.find((invoice) => invoice.key === allocation.invoiceKey);
    const pair = `${allocation.transactionId}|${allocation.invoiceKey}`;
    if (pairs.has(pair)) errors.push("Dezelfde bankbetaling is dubbel aan dezelfde factuur gekoppeld.");
    pairs.add(pair);
    if (!row || !invoice || invoice.error || row.allocations?.length || bankTransactionErrors(row).length || !validMoney(allocation.amount) || allocation.amount === 0 || Math.sign(allocation.amount) !== Math.sign(row.amount!) || Math.sign(allocation.amount) !== Math.sign(invoice.amount)) errors.push("Ongeldige koppeling, betaalrichting of reeds verwerkte betaling.");
  }
  for (const row of transactions) {
    const parts = allocations.filter((allocation) => allocation.transactionId === row.id);
    if (parts.length && parts.reduce((sum, part) => sum + bankCents(part.amount), 0) !== bankCents(row.amount!)) errors.push(`Betaling ${row.date} (${row.description.slice(0, 50)}): de gekoppelde bedragen sluiten niet aan op het bankbedrag.`);
  }
  for (const invoice of invoices) {
    const parts = allocations.filter((allocation) => allocation.invoiceKey === invoice.key);
    if (parts.length && parts.reduce((sum, part) => sum + bankCents(part.amount), 0) !== bankCents(invoice.amount)) errors.push(`Factuur ${invoice.invoiceNumber}: de betalingen zijn nog niet volledig of bevatten een overbetaling. Groepeer deelbetalingen tot het volledige factuurbedrag.`);
  }
  return [...new Set(errors)];
}
export function reconcileBankPayments<T extends ReconciliationEntry>(entries: T[], stored: BankStatement[], incoming: BankStatement[], allocations: BankAllocation[], acceptedSimilarIds: string[] = []) {
  const invoices = paymentInvoices(entries), statements = [...stored, ...incoming], transactions = statements.flatMap((statement) => statement.transactions);
  const errors = [...bankOverlapErrors(stored, incoming, acceptedSimilarIds), ...incoming.flatMap((statement) => [...bankStatementErrors(statement), ...(!statement.verified || !statement.complete ? ["Controleer en bevestig ieder nieuw afschrift volledig."] : [])]), ...validateBankAllocations(invoices, transactions, allocations)];
  if (errors.length) throw new Error([...new Set(errors)].join(" "));
  const paid = new Map(invoices.flatMap((invoice) => {
    const parts = allocations.filter((part) => part.invoiceKey === invoice.key);
    if (!parts.length) return [];
    parts.sort((a, b) => transactions.find((row) => row.id === a.transactionId)!.date.localeCompare(transactions.find((row) => row.id === b.transactionId)!.date) || a.transactionId.localeCompare(b.transactionId));
    const ids = [...new Set(parts.map((part) => part.transactionId))];
    const date = ids.map((id) => transactions.find((row) => row.id === id)!.date).sort().at(-1)!;
    const rows = invoice.entryIds.map((id) => entries.find((entry) => entry.id === id)!);
    const bases = rows.map((row) => bankCents(row.amount + invoicedVat(row))), assigned = rows.map(() => 0);
    const payments = rows.map(() => [] as Array<{ transactionId: string; date: string; amount: number; vatAmount: number }>);
    for (const [partIndex, part] of parts.entries()) {
      let remainder = bankCents(part.amount);
      rows.forEach((row, rowIndex) => {
        const share = partIndex === parts.length - 1 ? bases[rowIndex] - assigned[rowIndex] : rowIndex === rows.length - 1 ? remainder : Math.round(bankCents(part.amount) * bases[rowIndex] / bankCents(invoice.amount));
        remainder -= share; assigned[rowIndex] += share;
        payments[rowIndex].push({ transactionId: part.transactionId, date: transactions.find((row) => row.id === part.transactionId)!.date, amount: share / 100, vatAmount: 0 });
      });
    }
    payments.forEach((events, index) => {
      let assignedVat = 0; const vat = bankCents(invoicedVat(rows[index]));
      events.forEach((event, eventIndex) => { const share = eventIndex === events.length - 1 ? vat - assignedVat : bases[index] ? Math.round(vat * bankCents(event.amount) / bases[index]) : 0; event.vatAmount = share / 100; assignedVat += share; });
    });
    return invoice.entryIds.map((id, index) => [id, { ids, date, payments: payments[index] }] as const);
  }));
  return {
    entries: entries.map((entry) => { const payment = paid.get(entry.id); return payment ? { ...entry, status: "paid" as const, paidDate: payment.date, bankPaymentIds: payment.ids, bankPayments: payment.payments } : entry; }),
    bankStatements: statements.map((statement) => ({ ...statement, transactions: statement.transactions.map((row) => {
      const parts = allocations.filter((part) => part.transactionId === row.id);
      const reviewed = acceptedSimilarIds.includes(row.id) ? { ...row, overlapReviewed: true } : row;
      return parts.length ? { ...reviewed, allocations: parts.map((part) => { const invoice = invoices.find((invoice) => invoice.key === part.invoiceKey)!; return { invoiceKey: invoice.key, invoiceNumber: invoice.invoiceNumber, amount: part.amount, entryIds: invoice.entryIds }; }) } : reviewed;
    }) })),
    paidInvoiceCount: new Set(allocations.map((part) => part.invoiceKey)).size,
  };
}

export function unlinkBankPayment<T extends ReconciliationEntry>(entries: T[], statements: BankStatement[], transactionId: string) {
  const transactions = statements.flatMap((statement) => statement.transactions);
  const first = transactions.find((row) => row.id === transactionId);
  if (!first?.allocations?.length) throw new Error("Deze bankbetaling heeft geen opgeslagen koppeling.");
  const invoiceKeys = new Set(first.allocations.map((part) => part.invoiceKey));
  const affected = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of transactions) if (!affected.has(row.id) && row.allocations?.some((part) => invoiceKeys.has(part.invoiceKey))) {
      affected.add(row.id); for (const part of row.allocations) invoiceKeys.add(part.invoiceKey); changed = true;
    }
  }
  const entryIds = new Set(transactions.filter((row) => affected.has(row.id)).flatMap((row) => row.allocations!.flatMap((part) => part.entryIds)));
  return {
    entries: entries.map((entry) => entryIds.has(entry.id) ? { ...entry, status: "open" as const, paidDate: undefined, bankPaymentIds: undefined, bankPayments: undefined } : entry),
    bankStatements: statements.map((statement) => ({ ...statement, transactions: statement.transactions.map((row) => affected.has(row.id) ? { ...row, allocations: undefined } : row) })),
  };
}
