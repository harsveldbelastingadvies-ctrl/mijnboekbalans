type NumberedEntry = {
  id: string;
  date: string;
  type: string;
  invoiceNumber?: string;
};

type NumberedAdministration = {
  fiscalYear: number;
  nextInvoiceNumber?: string;
  entries: NumberedEntry[];
};

function parseNumber(value: string) {
  const match = value.trim().match(/^(.*?)(\d+)$/);
  return match ? { prefix: match[1], digits: match[2], value: BigInt(match[2]) } : null;
}

export function isValidInvoiceSequence(value: string) {
  return value.trim().length <= 80 && parseNumber(value) !== null;
}

export function incrementInvoiceNumber(value: string) {
  const parsed = parseNumber(value);
  if (!parsed) throw new Error("Het factuurnummer moet eindigen op een cijfer.");
  return `${parsed.prefix}${String(parsed.value + BigInt(1)).padStart(parsed.digits.length, "0")}`;
}

export function getNextInvoiceNumber(admin: NumberedAdministration) {
  const invoices = admin.entries.filter((entry) => entry.type === "income" && entry.invoiceNumber);
  const latest = invoices
    .filter((entry) => isValidInvoiceSequence(entry.invoiceNumber!))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const seed = admin.nextInvoiceNumber && isValidInvoiceSequence(admin.nextInvoiceNumber)
    ? admin.nextInvoiceNumber.trim()
    : latest ? incrementInvoiceNumber(latest.invoiceNumber!) : `${admin.fiscalYear}-0001`;
  const parsed = parseNumber(seed)!;
  let next = parsed.value;
  for (const entry of invoices) {
    const existing = parseNumber(entry.invoiceNumber!);
    if (existing && existing.prefix.toLowerCase() === parsed.prefix.toLowerCase() && existing.value >= next) {
      next = existing.value + BigInt(1);
    }
  }
  return `${parsed.prefix}${String(next).padStart(parsed.digits.length, "0")}`;
}

export function hasDuplicateSalesInvoice(entries: NumberedEntry[], number: string, excludeId?: string) {
  return Boolean(number.trim()) && entries.some((entry) =>
    entry.type === "income" && entry.id !== excludeId &&
    entry.invoiceNumber?.trim().toLowerCase() === number.trim().toLowerCase(),
  );
}
