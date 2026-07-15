"use client";

import {
  ChangeEvent,
  Children,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

type EntryType = "income" | "expense";
type EntryStatus = "paid" | "open";
type TabKey =
  | "overview"
  | "entries"
  | "invoices"
  | "payroll"
  | "checks"
  | "reports"
  | "contacts"
  | "settings";
type PeriodKey = "year" | "q1" | "q2" | "q3" | "q4";
type WorkspaceState = "checking" | "setup" | "locked" | "unlocked";

type Entry = {
  id: string;
  date: string;
  description: string;
  relation: string;
  category: string;
  type: EntryType;
  amount: number;
  vatRate: number;
  status: EntryStatus;
  depreciationYears?: 5 | 10;
};

type Contact = {
  id: string;
  name: string;
  email: string;
  address: string;
  kvk: string;
  type: "customer" | "supplier" | "entrepreneur";
};

type SalaryRecord = {
  id: string;
  employeeId?: string;
  employeeName: string;
  employeeBirthDate?: string;
  employeeAddress?: string;
  period: string;
  grossSalary: number;
  wageTax: number;
  netSalary: number;
  employerHealthContribution: number;
  status: EntryStatus;
  paymentDate: string;
};

type PayrollEmployee = {
  id: string;
  name: string;
  birthDate: string;
  postalCode: string;
  houseNumber: string;
  houseAddition: string;
  address: string;
};

type VatDeductionSettings = {
  enabled: boolean;
  taxableTurnover: number;
  exemptTurnover: number;
  manualPercent?: number;
};

type InvoiceDraft = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  source: "AI-herkenning" | "slim gelezen" | "handmatig";
  confidence: number;
  note: string;
  invoiceNumber: string;
  date: string;
  description: string;
  relation: string;
  type: EntryType;
  category: string;
  amount: string;
  vatRate: string;
  status: EntryStatus;
  selected: boolean;
};

type Administration = {
  id: string;
  name: string;
  owner: string;
  kvk: string;
  vatNumber: string;
  wageTaxNumber?: string;
  fiscalYear: number;
  iban: string;
  entries: Entry[];
  contacts: Contact[];
  payrollEmployees?: PayrollEmployee[];
  salaries?: SalaryRecord[];
  vatDeduction?: VatDeductionSettings;
};

type Summary = ReturnType<typeof calculateTotals>;

type WorkspaceProfile = {
  workspaceName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceResponse = {
  configured?: boolean;
  profile?: WorkspaceProfile;
  administrations?: Administration[];
  error?: string;
};

type ProfitLossStatement = ReturnType<typeof buildProfitLossStatement>;
type VatOverview = ReturnType<typeof buildVatOverview>;

const storageKey = "boekbalans-administraties-v1";

const periodOptions: Array<{ key: PeriodKey; label: string; file: string }> = [
  { key: "year", label: "Hele boekjaar", file: "boekjaar" },
  { key: "q1", label: "Kwartaal 1", file: "kwartaal-1" },
  { key: "q2", label: "Kwartaal 2", file: "kwartaal-2" },
  { key: "q3", label: "Kwartaal 3", file: "kwartaal-3" },
  { key: "q4", label: "Kwartaal 4", file: "kwartaal-4" },
];

const money = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

const today = new Date().toISOString().slice(0, 10);

const entryCategories: Record<EntryType, string[]> = {
  income: [
    "Omzet diensten",
    "Omzet producten",
    "Abonnementen",
    "Overige inkomsten",
  ],
  expense: [
    "Inkoop",
    "Investeringen",
    "Software",
    "Kantoorkosten",
    "Reiskosten",
    "Marketing",
    "Administratiekosten",
    "Overige kosten",
  ],
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const starterData: Administration[] = [
  {
    id: "admin-1",
    name: "Rustige Boekhouding BV",
    owner: "Sanne de Vries",
    kvk: "87342110",
    vatNumber: "NL812345678B01",
    fiscalYear: 2026,
    iban: "NL91 ABNA 0417 1643 00",
    payrollEmployees: [
      {
        id: "employee-1",
        name: "Sanne de Vries",
        birthDate: "1982-04-12",
        postalCode: "1011 AA",
        houseNumber: "12",
        houseAddition: "",
        address: "Havenstraat 12, 1011 AA Amsterdam",
      },
    ],
    salaries: [
      {
        id: "salary-1",
        employeeId: "employee-1",
        employeeName: "Sanne de Vries",
        period: "2026-07",
        grossSalary: 4200,
        wageTax: 1460,
        netSalary: 2740,
        employerHealthContribution: 290,
        status: "open",
        paymentDate: "2026-07-25",
      },
    ],
    contacts: [
      {
        id: "contact-1",
        name: "Studio Noorderlicht",
        email: "facturen@noorderlicht.nl",
        address: "Havenstraat 12, 1011 AA Amsterdam",
        kvk: "74201864",
        type: "customer",
      },
      {
        id: "contact-2",
        name: "Office Depot",
        email: "administratie@officedepot.nl",
        address: "Kantoorweg 8, 3542 AD Utrecht",
        kvk: "30124578",
        type: "supplier",
      },
    ],
    entries: [
      {
        id: "entry-1",
        date: "2026-07-01",
        description: "Consultancy juni",
        relation: "Studio Noorderlicht",
        category: "Omzet diensten",
        type: "income",
        amount: 2450,
        vatRate: 21,
        status: "paid",
      },
      {
        id: "entry-2",
        date: "2026-07-02",
        description: "Boekhoudpakket",
        relation: "Softwareleverancier",
        category: "Software",
        type: "expense",
        amount: 89,
        vatRate: 21,
        status: "open",
      },
      {
        id: "entry-3",
        date: "2026-07-04",
        description: "Kantoorartikelen",
        relation: "Office Depot",
        category: "Kantoorkosten",
        type: "expense",
        amount: 132.5,
        vatRate: 21,
        status: "paid",
      },
    ],
  },
];

const emptyEntry = {
  date: today,
  description: "",
  relation: "",
  type: "income" as EntryType,
  category: entryCategories.income[0],
  amount: "",
  vatRate: "21",
  status: "paid" as EntryStatus,
  depreciationYears: "none",
};

const emptyContact = {
  name: "",
  email: "",
  address: "",
  kvk: "",
  type: "customer" as Contact["type"],
};

const emptySalary = {
  employeeId: "",
  employeeName: "",
  period: today.slice(0, 7),
  grossSalary: "",
  wageTax: "",
  netSalary: "",
  employerHealthContribution: "",
  status: "open" as EntryStatus,
  paymentDate: today,
};

const emptyPayrollEmployee = {
  name: "",
  birthDate: "",
  postalCode: "",
  houseNumber: "",
  houseAddition: "",
  address: "",
};

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDecimal(value: string) {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatDecimalInput(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function findDateCandidate(source: string) {
  const iso = source.match(/\b(20\d{2})[-_/ .](0?[1-9]|1[0-2])[-_/ .](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const dutch = source.match(/\b(0?[1-9]|[12]\d|3[01])[-_/ .](0?[1-9]|1[0-2])[-_/ .](20\d{2})\b/);
  if (dutch) {
    return `${dutch[3]}-${dutch[2].padStart(2, "0")}-${dutch[1].padStart(2, "0")}`;
  }

  return today;
}

function findInvoiceNumber(source: string) {
  const match = source.match(/(?:factuur(?:nummer)?|invoice|inv|nr\.?)\s*[:#-]?\s*([a-z0-9-]{3,})/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function findVatRate(source: string) {
  const normalized = source.toLowerCase();
  if (normalized.includes("btw verlegd") || normalized.includes("vrijgesteld")) return "0";
  const rate = source.match(/\b(21|9|0)\s*%/);
  return rate?.[1] ?? "21";
}

function findAmountCandidate(source: string, vatRate: string) {
  const lines = source.split(/\n| {2,}/).map((line) => line.trim()).filter(Boolean);
  const labeledLine = lines.find((line) =>
    /(totaal|te betalen|factuurbedrag|bedrag excl|subtotaal|amount due|total)/i.test(line) &&
    /\d+[,.]\d{2}/.test(line),
  );
  const candidateSource = labeledLine || source;
  const matches = Array.from(candidateSource.matchAll(/(?:eur|€)?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}|\d+[,.]\d{2})/gi));
  const amounts = matches
    .map((match) => parseDecimal(match[1]))
    .filter((amount): amount is number => amount !== null && amount > 0);
  if (!amounts.length) return "";

  const largestAmount = Math.max(...amounts);
  const rate = Number(vatRate);
  const hasInclusiveHint = /(incl\.?\s*btw|te betalen|totaal|amount due|total)/i.test(candidateSource);
  const hasExclusiveHint = /(excl\.?\s*btw|subtotaal|grondslag)/i.test(candidateSource);
  const exclusiveAmount =
    hasInclusiveHint && !hasExclusiveHint && rate > 0
      ? largestAmount / (1 + rate / 100)
      : largestAmount;

  return formatDecimalInput(exclusiveAmount);
}

function inferInvoiceType(source: string, fileName: string): EntryType {
  const normalized = normalizeSearchText(`${fileName} ${source}`);
  if (/\b(verkoop|sales|debiteur|outgoing|omzet|inkomsten)\b/.test(normalized)) return "income";
  if (/\b(inkoop|purchase|supplier|leverancier|bon|receipt|kosten|uitgaven)\b/.test(normalized)) return "expense";
  return "expense";
}

function inferRelation(source: string, contacts: Contact[]) {
  const normalized = normalizeSearchText(source);
  const match = contacts.find((contact) => normalized.includes(normalizeSearchText(contact.name)));
  return match?.name ?? "";
}

function buildInvoiceDraft(file: File, sourceText: string, contacts: Contact[]): InvoiceDraft {
  const source = `${file.name}\n${sourceText}`;
  const type = inferInvoiceType(sourceText, file.name);
  const vatRate = findVatRate(source);
  const relation = inferRelation(source, contacts);
  const amount = findAmountCandidate(source, vatRate);
  const invoiceNumber = findInvoiceNumber(source);
  const confidenceParts = [
    amount ? 24 : 0,
    relation ? 22 : 0,
    invoiceNumber ? 14 : 0,
    sourceText.trim().length > 80 ? 18 : 0,
    findDateCandidate(source) !== today ? 12 : 0,
    vatRate ? 10 : 0,
  ];
  const confidence = Math.min(92, 22 + confidenceParts.reduce((total, value) => total + value, 0));

  return {
    id: uid(),
    fileName: file.name,
    fileType: file.type || "Onbekend bestandstype",
    fileSize: file.size,
    createdAt: new Date().toISOString(),
    source: sourceText.trim() ? "slim gelezen" : "handmatig",
    confidence,
    note: sourceText.trim()
      ? "Controleer de voorgestelde velden voordat je boekt."
      : "Dit bestand bevatte geen direct leesbare tekst. Vul de ontbrekende velden aan.",
    invoiceNumber,
    date: findDateCandidate(source),
    description: invoiceNumber ? `Factuur ${invoiceNumber}` : file.name.replace(/\.[^.]+$/, ""),
    relation,
    type,
    category: entryCategories[type][0],
    amount,
    vatRate,
    status: type === "income" ? "open" : "paid",
    selected: true,
  };
}

type InvoiceAiResult = {
  invoiceNumber: string;
  date: string;
  description: string;
  relation: string;
  type: EntryType;
  category: string;
  amountExVat: number;
  vatRate: 0 | 9 | 21;
  status: EntryStatus;
  confidence: number;
  note: string;
};

function buildAiInvoiceDraft(file: File, result: InvoiceAiResult): InvoiceDraft {
  return {
    id: uid(),
    fileName: file.name,
    fileType: file.type || "Onbekend bestandstype",
    fileSize: file.size,
    createdAt: new Date().toISOString(),
    source: "AI-herkenning",
    confidence: Math.min(98, Math.max(0, Math.round(result.confidence))),
    note: result.note || "AI-voorstel gemaakt. Controleer de velden voordat je boekt.",
    invoiceNumber: result.invoiceNumber || "",
    date: result.date || today,
    description: result.description || (result.invoiceNumber ? `Factuur ${result.invoiceNumber}` : "Factuur"),
    relation: result.relation || "",
    type: result.type,
    category: result.category || entryCategories[result.type][0],
    amount: result.amountExVat > 0 ? formatDecimalInput(result.amountExVat) : "",
    vatRate: String(result.vatRate),
    status: result.status,
    selected: true,
  };
}

const emptyVatDeduction: VatDeductionSettings = {
  enabled: false,
  taxableTurnover: 0,
  exemptTurnover: 0,
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, value));
}

function getVatDeductionSettings(admin: Administration) {
  return admin.vatDeduction ?? emptyVatDeduction;
}

function calculateVatDeductionPercent(settings: VatDeductionSettings) {
  if (!settings.enabled) return 100;
  if (typeof settings.manualPercent === "number") {
    return clampPercent(settings.manualPercent);
  }

  const taxable = Math.max(0, settings.taxableTurnover);
  const exempt = Math.max(0, settings.exemptTurnover);
  const total = taxable + exempt;
  if (!total) return 100;
  return clampPercent((taxable / total) * 100);
}

function calculateTotals(entries: Entry[], vatDeductionPercent = 100) {
  const inputVatDeductionFactor = clampPercent(vatDeductionPercent) / 100;
  return entries.reduce(
    (acc, entry) => {
      const vat = entry.amount * (entry.vatRate / 100);
      const total = entry.amount + vat;
      const deductibleInputVat =
        entry.type === "expense" ? vat * inputVatDeductionFactor : 0;
      const nonDeductibleVat =
        entry.type === "expense" ? vat - deductibleInputVat : 0;
      const annualDepreciation =
        entry.type === "expense" && entry.depreciationYears
          ? entry.amount / entry.depreciationYears
          : 0;

      if (entry.type === "income") {
        acc.revenue += entry.amount;
        acc.vatToPay += vat;
        acc.incomeCount += 1;
      } else {
        acc.costs += entry.amount + nonDeductibleVat;
        acc.expenseAmountExVat += entry.amount;
        acc.inputVatTotal += vat;
        acc.vatToClaim += deductibleInputVat;
        acc.nonDeductibleVat += nonDeductibleVat;
        acc.expenseCount += 1;
        acc.annualDepreciation += annualDepreciation;
        if (entry.depreciationYears) acc.depreciationCount += 1;
      }

      if (entry.status === "open") {
        acc.open += total;
        acc.openCount += 1;
      }

      return acc;
    },
    {
      revenue: 0,
      costs: 0,
      expenseAmountExVat: 0,
      vatToPay: 0,
      vatToClaim: 0,
      inputVatTotal: 0,
      nonDeductibleVat: 0,
      open: 0,
      incomeCount: 0,
      expenseCount: 0,
      openCount: 0,
      annualDepreciation: 0,
      depreciationCount: 0,
    },
  );
}

function getEntryQuarter(date: string) {
  const month = Number(date.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return Math.ceil(month / 3) as 1 | 2 | 3 | 4;
}

function getPeriodLabel(period: PeriodKey) {
  return periodOptions.find((option) => option.key === period)?.label ?? "Hele boekjaar";
}

function getPeriodFilePart(period: PeriodKey) {
  return periodOptions.find((option) => option.key === period)?.file ?? "boekjaar";
}

function filterEntriesByPeriod(entries: Entry[], fiscalYear: number, period: PeriodKey) {
  return entries.filter((entry) => {
    const year = Number(entry.date.slice(0, 4));
    if (year !== fiscalYear) return false;
    if (period === "year") return true;
    return `q${getEntryQuarter(entry.date)}` === period;
  });
}

function getQuarterSummaries(entries: Entry[], fiscalYear: number, vatDeductionPercent = 100) {
  return ([1, 2, 3, 4] as const).map((quarter) => {
    const period = `q${quarter}` as PeriodKey;
    const periodEntries = filterEntriesByPeriod(entries, fiscalYear, period);
    return {
      quarter,
      entries: periodEntries,
      summary: calculateTotals(periodEntries, vatDeductionPercent),
    };
  });
}

function groupEntriesByCategory(
  entries: Entry[],
  type: EntryType,
  includeEntry: (entry: Entry) => boolean = () => true,
) {
  const totals = new Map<string, number>();
  entries
    .filter((entry) => entry.type === type && includeEntry(entry))
    .forEach((entry) => {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amount);
    });

  return Array.from(totals, ([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function buildProfitLossStatement(entries: Entry[], vatDeductionPercent = 100) {
  const summary = calculateTotals(entries, vatDeductionPercent);
  const revenueLines = groupEntriesByCategory(entries, "income");
  const expenseLines = groupEntriesByCategory(
    entries,
    "expense",
    (entry) => !entry.depreciationYears,
  );
  const nonDeductibleVatLine =
    summary.nonDeductibleVat > 0
      ? [{ label: "Niet-aftrekbare btw", amount: summary.nonDeductibleVat }]
      : [];
  const expenseTotal =
    expenseLines.reduce((total, line) => total + line.amount, 0) +
    summary.nonDeductibleVat;
  const profitBeforeDepreciation = summary.revenue - expenseTotal;
  const profitAfterDepreciation = profitBeforeDepreciation - summary.annualDepreciation;

  return {
    revenueLines,
    expenseLines: [...expenseLines, ...nonDeductibleVatLine],
    revenueTotal: summary.revenue,
    expenseTotal,
    nonDeductibleVat: summary.nonDeductibleVat,
    depreciation: summary.annualDepreciation,
    profitBeforeDepreciation,
    profitAfterDepreciation,
  };
}

function buildVatOverview(entries: Entry[], vatDeductionPercent = 100) {
  const inputVatDeductionFactor = clampPercent(vatDeductionPercent) / 100;

  const sortByRate = (a: { vatRate: number }, b: { vatRate: number }) => b.vatRate - a.vatRate;
  const groupByVatRate = (
    type: EntryType,
    mapAmounts: (entry: Entry) => { basis: number; vat: number; deductibleVat?: number },
  ) => {
    const grouped = new Map<number, { vatRate: number; basis: number; vat: number; deductibleVat: number }>();
    entries
      .filter((entry) => entry.type === type)
      .forEach((entry) => {
        const amounts = mapAmounts(entry);
        const current = grouped.get(entry.vatRate) ?? {
          vatRate: entry.vatRate,
          basis: 0,
          vat: 0,
          deductibleVat: 0,
        };
        current.basis += amounts.basis;
        current.vat += amounts.vat;
        current.deductibleVat += amounts.deductibleVat ?? amounts.vat;
        grouped.set(entry.vatRate, current);
      });

    return Array.from(grouped.values()).sort(sortByRate);
  };

  const salesLines = groupByVatRate("income", (entry) => ({
    basis: entry.amount,
    vat: entry.amount * (entry.vatRate / 100),
  }));
  const inputVatLines = groupByVatRate("expense", (entry) => {
    const vat = entry.amount * (entry.vatRate / 100);
    return {
      basis: entry.amount,
      vat,
      deductibleVat: vat * inputVatDeductionFactor,
    };
  });
  const salesBasisTotal = salesLines.reduce((total, line) => total + line.basis, 0);
  const salesVatTotal = salesLines.reduce((total, line) => total + line.vat, 0);
  const inputBasisTotal = inputVatLines.reduce((total, line) => total + line.basis, 0);
  const inputVatTotal = inputVatLines.reduce((total, line) => total + line.vat, 0);
  const deductibleInputVatTotal = inputVatLines.reduce((total, line) => total + line.deductibleVat, 0);
  const nonDeductibleInputVatTotal = inputVatTotal - deductibleInputVatTotal;
  const vatBalance = salesVatTotal - deductibleInputVatTotal;

  return {
    salesLines,
    inputVatLines,
    salesBasisTotal,
    salesVatTotal,
    inputBasisTotal,
    inputVatTotal,
    deductibleInputVatTotal,
    nonDeductibleInputVatTotal,
    vatBalance,
    vatDeductionPercent: clampPercent(vatDeductionPercent),
  };
}

function getAdminSalaries(admin: Administration) {
  return admin.salaries ?? [];
}

function getPayrollEmployees(admin: Administration) {
  return admin.payrollEmployees ?? [];
}

function getSalaryEmployee(admin: Administration, salary: SalaryRecord) {
  const employees = getPayrollEmployees(admin);
  return (
    employees.find((employee) => employee.id === salary.employeeId) ??
    employees.find((employee) => employee.name === salary.employeeName) ??
    null
  );
}

function getSalaryEmployeeName(admin: Administration, salary: SalaryRecord) {
  return getSalaryEmployee(admin, salary)?.name || salary.employeeName;
}

function getSalaryEmployeeBirthDate(admin: Administration, salary: SalaryRecord) {
  return getSalaryEmployee(admin, salary)?.birthDate || salary.employeeBirthDate || "";
}

function getSalaryEmployeeAddress(admin: Administration, salary: SalaryRecord) {
  return getSalaryEmployee(admin, salary)?.address || salary.employeeAddress || "";
}

function getSalaryYear(period: string) {
  return Number(period.slice(0, 4));
}

function getSalaryMonthLabel(period: string) {
  const [year, month] = period.split("-");
  if (!year || !month) return period;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

function filterSalariesByYear(salaries: SalaryRecord[], fiscalYear: number) {
  return salaries.filter((salary) => getSalaryYear(salary.period) === fiscalYear);
}

function calculateSalaryTotals(salaries: SalaryRecord[]) {
  return salaries.reduce(
    (acc, salary) => {
      acc.grossSalary += salary.grossSalary;
      acc.wageTax += salary.wageTax;
      acc.netSalary += salary.netSalary;
      acc.employerHealthContribution += salary.employerHealthContribution;
      if (salary.status === "open") acc.openCount += 1;
      return acc;
    },
    {
      grossSalary: 0,
      wageTax: 0,
      netSalary: 0,
      employerHealthContribution: 0,
      openCount: 0,
    },
  );
}

function calculateLaborTaxCredit(annualGrossSalary: number, fiscalYear: number) {
  const supportedYear = fiscalYear >= 2025 ? 2025 : fiscalYear;
  if (supportedYear !== 2025 || annualGrossSalary <= 0) return 0;

  if (annualGrossSalary <= 12169) {
    return Math.round(annualGrossSalary * 0.08053);
  }

  if (annualGrossSalary <= 26288) {
    return Math.round(980 + (annualGrossSalary - 12169) * 0.3003);
  }

  if (annualGrossSalary <= 43071) {
    return Math.round(5220 + (annualGrossSalary - 26288) * 0.02258);
  }

  if (annualGrossSalary <= 129078) {
    return Math.max(0, Math.round(5599 - (annualGrossSalary - 43071) * 0.0651));
  }

  return 0;
}

function contactTypeLabel(type: Contact["type"]) {
  if (type === "customer") return "Klant";
  if (type === "supplier") return "Leverancier";
  return "Ondernemer";
}

function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isAdministration(value: unknown): value is Administration {
  if (!value || typeof value !== "object") return false;
  const admin = value as Partial<Administration>;
  return (
    typeof admin.id === "string" &&
    typeof admin.name === "string" &&
    typeof admin.fiscalYear === "number" &&
    Array.isArray(admin.entries) &&
    Array.isArray(admin.contacts)
  );
}

async function workspaceRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as WorkspaceResponse;
  if (!response.ok) throw new Error(data.error ?? "Opslagactie mislukt.");
  return data;
}

function downloadTextFile(filename: string, contents: string, type = "application/json;charset=utf-8") {
  const blob = new Blob([contents], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function pdfSafe(value: string | number) {
  return String(value)
    .replaceAll("\u00a0", " ")
    .replaceAll("€", "EUR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdfText(value: string | number) {
  return pdfSafe(value).replace(/[\\()]/g, "\\$&");
}

function buildPdfReport(
  admin: Administration,
  entries: Entry[],
  summary: Summary,
  periodLabel: string,
  quarterSummaries: Array<{ quarter: 1 | 2 | 3 | 4; entries: Entry[]; summary: Summary }>,
) {
  const encoder = new TextEncoder();
  const pages: string[] = [];
  let commands: string[] = [];
  let y = 790;
  let pageNumber = 0;

  const colors = {
    ink: [0.09, 0.14, 0.12],
    muted: [0.4, 0.45, 0.43],
    line: [0.86, 0.9, 0.87],
    teal: [0.06, 0.46, 0.43],
    tealSoft: [0.88, 0.96, 0.91],
    blue: [0.15, 0.39, 0.92],
    coral: [0.89, 0.37, 0.27],
    yellow: [0.79, 0.54, 0.02],
    white: [1, 1, 1],
  };

  const rgb = (color: number[]) => color.join(" ");
  const truncate = (value: string, max: number) =>
    pdfSafe(value).length > max ? `${pdfSafe(value).slice(0, max - 1)}...` : pdfSafe(value);

  const rect = (
    x: number,
    bottom: number,
    width: number,
    height: number,
    fill: number[],
    stroke?: number[],
  ) => {
    commands.push(`${rgb(fill)} rg ${x} ${bottom} ${width} ${height} re f`);
    if (stroke) commands.push(`${rgb(stroke)} RG 0.7 w ${x} ${bottom} ${width} ${height} re S`);
  };

  const text = (
    value: string | number,
    x: number,
    baseline: number,
    size = 10,
    color = colors.ink,
    font = "F1",
  ) => {
    commands.push(`${rgb(color)} rg BT /${font} ${size} Tf ${x} ${baseline} Td (${escapePdfText(value)}) Tj ET`);
  };

  const finishPage = () => {
    if (!commands.length) return;
    text(`BoekBalans · ${new Date().toLocaleDateString("nl-NL")} · pagina ${pageNumber}`, 42, 26, 8, colors.muted);
    pages.push(commands.join("\n"));
    commands = [];
  };

  const newPage = () => {
    finishPage();
    pageNumber += 1;
    y = 790;
    if (pageNumber > 1) {
      text(admin.name, 42, 806, 10, colors.teal, "F2");
      text(`${periodLabel} · boekjaar ${admin.fiscalYear}`, 42, 791, 9, colors.muted);
      y = 760;
    }
  };

  const ensureSpace = (height: number) => {
    if (y - height < 58) newPage();
  };

  const addSectionTitle = (title: string) => {
    ensureSpace(36);
    text(title, 42, y, 14, colors.ink, "F2");
    y -= 18;
    commands.push(`${rgb(colors.line)} RG 0.7 w 42 ${y} m 553 ${y} l S`);
    y -= 16;
  };

  const addCard = (x: number, bottom: number, width: number, label: string, value: string, accent: number[]) => {
    rect(x, bottom, width, 58, colors.white, colors.line);
    rect(x, bottom + 54, width, 4, accent);
    text(label.toUpperCase(), x + 10, bottom + 38, 7.5, colors.muted, "F2");
    text(value, x + 10, bottom + 17, 13, colors.ink, "F2");
  };

  const addEntryHeader = () => {
    rect(42, y - 14, 511, 22, colors.tealSoft, colors.line);
    text("Datum", 50, y - 6, 8, colors.teal, "F2");
    text("Omschrijving", 104, y - 6, 8, colors.teal, "F2");
    text("Soort", 285, y - 6, 8, colors.teal, "F2");
    text("Categorie", 350, y - 6, 8, colors.teal, "F2");
    text("Bedrag", 440, y - 6, 8, colors.teal, "F2");
    text("Status", 508, y - 6, 8, colors.teal, "F2");
    y -= 28;
  };

  const profit = summary.revenue - summary.costs;
  const vatBalance = summary.vatToPay - summary.vatToClaim;

  newPage();
  rect(42, 724, 511, 86, colors.teal);
  text("BoekBalans", 62, 785, 11, colors.white, "F2");
  text(admin.name, 62, 758, 24, colors.white, "F2");
  text(`${periodLabel} · boekjaar ${admin.fiscalYear}`, 62, 739, 11, colors.white);
  text("Financieel rapport", 428, 785, 11, colors.white, "F2");

  rect(42, 650, 511, 56, colors.tealSoft, colors.line);
  text(`Ondernemer: ${admin.owner || "-"}`, 58, 686, 9, colors.ink, "F2");
  text(`KvK: ${admin.kvk || "-"}    Btw-nummer: ${admin.vatNumber || "-"}`, 58, 670, 9, colors.ink);
  text(`IBAN: ${admin.iban || "-"}`, 58, 654, 9, colors.ink);

  addCard(42, 568, 119, "Omzet", money.format(summary.revenue), colors.teal);
  addCard(174, 568, 119, "Kosten", money.format(summary.costs), colors.coral);
  addCard(306, 568, 119, "Resultaat", money.format(profit), profit >= 0 ? colors.blue : colors.coral);
  addCard(438, 568, 115, "Open posten", money.format(summary.open), colors.yellow);
  addCard(42, 494, 119, "Ontvangen btw", money.format(summary.vatToPay), colors.teal);
  addCard(174, 494, 119, "Aftrekbare btw", money.format(summary.vatToClaim), colors.blue);
  addCard(306, 494, 119, vatBalance >= 0 ? "Btw te betalen" : "Btw terug", money.format(Math.abs(vatBalance)), vatBalance >= 0 ? colors.coral : colors.blue);
  addCard(438, 494, 115, "Niet aftrekbaar", money.format(summary.nonDeductibleVat), colors.yellow);

  y = 452;
  addSectionTitle("Boekingen");
  if (!entries.length) {
    text("Geen boekingen in deze periode.", 42, y, 10, colors.muted);
    y -= 18;
  } else {
    addEntryHeader();
    entries.forEach((entry) => {
      const kind = entry.type === "income" ? "Inkomsten" : "Uitgaven";
      ensureSpace(28);
      if (y > 750 || y < 74) addEntryHeader();
      text(entry.date, 50, y, 8.5);
      text(truncate(entry.description, 29), 104, y, 8.5, colors.ink, "F2");
      text(kind, 285, y, 8.5);
      text(truncate(entry.category, 15), 350, y, 8.5);
      text(money.format(entry.amount), 440, y, 8.5);
      text(entry.status === "paid" ? "Betaald" : "Open", 508, y, 8.5, entry.status === "paid" ? colors.teal : colors.coral, "F2");
      text(truncate(entry.relation, 42), 104, y - 12, 7.5, colors.muted);
      commands.push(`${rgb(colors.line)} RG 0.45 w 42 ${y - 18} m 553 ${y - 18} l S`);
      y -= 28;
    });
  }

  y -= 10;
  addSectionTitle("Kwartaaloverzicht");
  rect(42, y - 14, 511, 22, colors.tealSoft, colors.line);
  text("Kwartaal", 50, y - 6, 8, colors.teal, "F2");
  text("Boekingen", 120, y - 6, 8, colors.teal, "F2");
  text("Omzet", 200, y - 6, 8, colors.teal, "F2");
  text("Kosten", 285, y - 6, 8, colors.teal, "F2");
  text("Resultaat", 370, y - 6, 8, colors.teal, "F2");
  text("Btw saldo", 465, y - 6, 8, colors.teal, "F2");
  y -= 30;
  quarterSummaries.forEach(({ quarter, entries: quarterEntries, summary: quarterSummary }) => {
    const quarterProfit = quarterSummary.revenue - quarterSummary.costs;
    const quarterVat = quarterSummary.vatToPay - quarterSummary.vatToClaim;
    ensureSpace(20);
    text(`Kwartaal ${quarter}`, 50, y, 8.5, colors.ink, "F2");
    text(quarterEntries.length, 120, y, 8.5);
    text(money.format(quarterSummary.revenue), 200, y, 8.5);
    text(money.format(quarterSummary.costs), 285, y, 8.5);
    text(money.format(quarterProfit), 370, y, 8.5);
    text(money.format(quarterVat), 465, y, 8.5);
    commands.push(`${rgb(colors.line)} RG 0.45 w 42 ${y - 8} m 553 ${y - 8} l S`);
    y -= 20;
  });
  finishPage();

  const objects: string[] = [
    "",
    "",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  const pageIds: number[] = [];

  pages.forEach((stream) => {
    const contentId = objects.length;
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = encoder.encode(pdf).length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefStart = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

type PdfTableSection = {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  widths: number[];
  emptyText?: string;
};

function buildTablePdf(
  admin: Administration,
  title: string,
  periodLabel: string,
  sections: PdfTableSection[],
) {
  const encoder = new TextEncoder();
  const pages: string[] = [];
  let commands: string[] = [];
  let pageNumber = 0;
  let y = 790;
  const colors = {
    ink: [0.09, 0.14, 0.12],
    muted: [0.4, 0.45, 0.43],
    line: [0.86, 0.9, 0.87],
    teal: [0.06, 0.46, 0.43],
    tealSoft: [0.88, 0.96, 0.91],
    white: [1, 1, 1],
  };

  const rgb = (color: number[]) => color.join(" ");
  const truncate = (value: string | number, width: number) => {
    const safe = pdfSafe(value);
    const max = Math.max(8, Math.floor(width / 5.2));
    return safe.length > max ? `${safe.slice(0, max - 1)}...` : safe;
  };
  const rect = (x: number, bottom: number, width: number, height: number, fill: number[], stroke?: number[]) => {
    commands.push(`${rgb(fill)} rg ${x} ${bottom} ${width} ${height} re f`);
    if (stroke) commands.push(`${rgb(stroke)} RG 0.7 w ${x} ${bottom} ${width} ${height} re S`);
  };
  const text = (
    value: string | number,
    x: number,
    baseline: number,
    size = 9,
    color = colors.ink,
    font = "F1",
  ) => {
    commands.push(`${rgb(color)} rg BT /${font} ${size} Tf ${x} ${baseline} Td (${escapePdfText(value)}) Tj ET`);
  };
  const finishPage = () => {
    if (!commands.length) return;
    text(`BoekBalans · ${new Date().toLocaleDateString("nl-NL")} · pagina ${pageNumber}`, 42, 26, 8, colors.muted);
    pages.push(commands.join("\n"));
    commands = [];
  };
  const newPage = () => {
    finishPage();
    pageNumber += 1;
    y = 790;
    if (pageNumber === 1) {
      rect(42, 724, 511, 86, colors.teal);
      text("BoekBalans", 62, 785, 11, colors.white, "F2");
      text(title, 62, 758, 22, colors.white, "F2");
      text(`${admin.name} · ${periodLabel} · boekjaar ${admin.fiscalYear}`, 62, 739, 11, colors.white);
      rect(42, 650, 511, 56, colors.tealSoft, colors.line);
      text(`Ondernemer: ${admin.owner || "-"}`, 58, 686, 9, colors.ink, "F2");
      text(`KvK: ${admin.kvk || "-"}    Btw-nummer: ${admin.vatNumber || "-"}`, 58, 670, 9, colors.ink);
      text(`IBAN: ${admin.iban || "-"}`, 58, 654, 9, colors.ink);
      y = 612;
    } else {
      text(title, 42, 806, 10, colors.teal, "F2");
      text(`${admin.name} · ${periodLabel}`, 42, 791, 9, colors.muted);
      y = 760;
    }
  };
  const ensureSpace = (height: number) => {
    if (y - height < 58) newPage();
  };
  const addSectionTitle = (sectionTitle: string) => {
    ensureSpace(42);
    text(sectionTitle, 42, y, 14, colors.ink, "F2");
    y -= 18;
    commands.push(`${rgb(colors.line)} RG 0.7 w 42 ${y} m 553 ${y} l S`);
    y -= 16;
  };
  const addHeader = (section: PdfTableSection) => {
    rect(42, y - 14, 511, 22, colors.tealSoft, colors.line);
    let x = 50;
    section.headers.forEach((header, index) => {
      text(header, x, y - 6, 7.5, colors.teal, "F2");
      x += section.widths[index];
    });
    y -= 28;
  };

  newPage();
  sections.forEach((section) => {
    addSectionTitle(section.title);
    if (!section.rows.length) {
      text(section.emptyText ?? "Geen gegevens in deze periode.", 42, y, 9, colors.muted);
      y -= 26;
      return;
    }

    addHeader(section);
    section.rows.forEach((row) => {
      ensureSpace(24);
      if (y > 750 || y < 74) addHeader(section);
      let x = 50;
      row.forEach((cell, index) => {
        const isAmount = index === row.length - 1;
        text(truncate(cell, section.widths[index]), x, y, 8.2, isAmount ? colors.ink : colors.muted, isAmount ? "F2" : "F1");
        x += section.widths[index];
      });
      commands.push(`${rgb(colors.line)} RG 0.45 w 42 ${y - 10} m 553 ${y - 10} l S`);
      y -= 22;
    });
    y -= 12;
  });
  finishPage();

  const objects: string[] = [
    "",
    "",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  const pageIds: number[] = [];

  pages.forEach((stream) => {
    const contentId = objects.length;
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = encoder.encode(pdf).length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefStart = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function buildReportPdf(admin: Administration, summary: Summary, periodLabel: string) {
  const profit = summary.revenue - summary.costs;
  const vatBalance = summary.vatToPay - summary.vatToClaim;
  return buildTablePdf(admin, "Financieel overzicht", periodLabel, [
    {
      title: "Kengetallen",
      headers: ["Onderdeel", "Bedrag"],
      widths: [340, 171],
      rows: [
        ["Omzet excl. btw", money.format(summary.revenue)],
        ["Kosten incl. niet-aftrekbare btw", money.format(summary.costs)],
        ["Resultaat", money.format(profit)],
        ["Ontvangen btw", money.format(summary.vatToPay)],
        ["Betaalde btw op kosten", money.format(summary.inputVatTotal)],
        ["Aftrekbare voorbelasting", money.format(summary.vatToClaim)],
        ["Niet-aftrekbare btw als kosten", money.format(summary.nonDeductibleVat)],
        [vatBalance >= 0 ? "Btw te betalen" : "Btw terug te vragen", money.format(Math.abs(vatBalance))],
        ["Afschrijvingen per jaar", money.format(summary.annualDepreciation)],
        ["Open posten incl. btw", money.format(summary.open)],
      ],
    },
  ]);
}

function buildProfitLossPdf(admin: Administration, statement: ProfitLossStatement, periodLabel: string) {
  return buildTablePdf(admin, "Winst- en verliesrekening", periodLabel, [
    {
      title: "Opbrengsten",
      headers: ["Rubriek", "Omschrijving", "Bedrag"],
      widths: [125, 260, 126],
      rows: [
        ...statement.revenueLines.map((line) => ["Opbrengsten", line.label, money.format(line.amount)]),
        ["Totaal", "Totaal opbrengsten", money.format(statement.revenueTotal)],
      ],
      emptyText: "Nog geen opbrengsten in deze periode.",
    },
    {
      title: "Kosten en afschrijvingen",
      headers: ["Rubriek", "Omschrijving", "Bedrag"],
      widths: [125, 260, 126],
      rows: [
        ...statement.expenseLines.map((line) => ["Kosten", line.label, money.format(line.amount)]),
        ["Afschrijvingen", "Afschrijvingen per jaar", money.format(statement.depreciation)],
        ["Totaal", "Totaal kosten", money.format(statement.expenseTotal + statement.depreciation)],
      ],
      emptyText: "Nog geen kosten in deze periode.",
    },
    {
      title: "Resultaat",
      headers: ["Onderdeel", "Bedrag"],
      widths: [340, 171],
      rows: [
        ["Resultaat voor afschrijving", money.format(statement.profitBeforeDepreciation)],
        ["Resultaat na afschrijving", money.format(statement.profitAfterDepreciation)],
      ],
    },
  ]);
}

function buildVatOverviewPdf(admin: Administration, overview: VatOverview, periodLabel: string) {
  return buildTablePdf(admin, "Btw-overzicht", periodLabel, [
    {
      title: "Omzet en verschuldigde omzetbelasting",
      headers: ["Btw-tarief", "Grondslag", "Verschuldigde btw"],
      widths: [125, 190, 196],
      rows: [
        ...overview.salesLines.map((line) => [
          `${line.vatRate}%`,
          money.format(line.basis),
          money.format(line.vat),
        ]),
        ["Totaal", money.format(overview.salesBasisTotal), money.format(overview.salesVatTotal)],
      ],
      emptyText: "Nog geen omzet in deze periode.",
    },
    {
      title: "Voorbelasting",
      headers: ["Btw-tarief", "Grondslag kosten", "Betaalde btw", "Aftrekbare voorbelasting"],
      widths: [80, 135, 135, 161],
      rows: [
        ...overview.inputVatLines.map((line) => [
          `${line.vatRate}%`,
          money.format(line.basis),
          money.format(line.vat),
          money.format(line.deductibleVat),
        ]),
        [
          "Totaal",
          money.format(overview.inputBasisTotal),
          money.format(overview.inputVatTotal),
          money.format(overview.deductibleInputVatTotal),
        ],
      ],
      emptyText: "Nog geen kosten met voorbelasting in deze periode.",
    },
    {
      title: "Saldo btw",
      headers: ["Onderdeel", "Bedrag"],
      widths: [340, 171],
      rows: [
        ["Verschuldigde omzetbelasting", money.format(overview.salesVatTotal)],
        ["Aftrekbare voorbelasting", money.format(overview.deductibleInputVatTotal)],
        ["Niet-aftrekbare voorbelasting", money.format(overview.nonDeductibleInputVatTotal)],
        ["Aftrekpercentage voorbelasting", `${overview.vatDeductionPercent.toFixed(2)}%`],
        [
          overview.vatBalance >= 0 ? "Btw te betalen" : "Btw terug te vragen",
          money.format(Math.abs(overview.vatBalance)),
        ],
      ],
    },
  ]);
}

function buildEntriesPdf(admin: Administration, entries: Entry[], periodLabel: string) {
  return buildTablePdf(admin, "Boekingen", periodLabel, [
    {
      title: "Boekingen",
      headers: ["Datum", "Omschrijving", "Relatie", "Soort", "Categorie", "Excl.", "Btw", "Status"],
      widths: [50, 112, 75, 58, 76, 52, 46, 42],
      rows: entries.map((entry) => [
        entry.date,
        entry.description,
        entry.relation,
        entry.type === "income" ? "Inkomsten" : "Uitgaven",
        entry.category,
        money.format(entry.amount),
        `${entry.vatRate}%`,
        entry.status === "paid" ? "Betaald" : "Open",
      ]),
      emptyText: "Geen boekingen in deze periode.",
    },
  ]);
}

function buildContactsPdf(admin: Administration) {
  return buildTablePdf(admin, "Relaties", "Alle relaties", [
    {
      title: "Klanten en leveranciers",
      headers: ["Naam", "E-mail", "Vestigingsadres", "KvK", "Soort"],
      widths: [126, 110, 145, 70, 60],
      rows: admin.contacts.map((contact) => [
        contact.name,
        contact.email || "-",
        contact.address || "-",
        contact.kvk || "-",
        contactTypeLabel(contact.type),
      ]),
      emptyText: "Nog geen relaties vastgelegd.",
    },
  ]);
}

function buildPayslipPdf(admin: Administration, salary: SalaryRecord) {
  const employeeName = getSalaryEmployeeName(admin, salary);
  const employeeBirthDate = getSalaryEmployeeBirthDate(admin, salary);
  const employeeAddress = getSalaryEmployeeAddress(admin, salary);

  return buildTablePdf(admin, "Loonstrook", getSalaryMonthLabel(salary.period), [
    {
      title: "Werknemer en periode",
      headers: ["Onderdeel", "Gegeven"],
      widths: [190, 321],
      rows: [
        ["Werknemer", employeeName],
        ["Geboortedatum", employeeBirthDate || "-"],
        ["Adres werknemer", employeeAddress || "-"],
        ["Periode", getSalaryMonthLabel(salary.period)],
        ["Betaaldatum", salary.paymentDate || "-"],
        ["Status", salary.status === "paid" ? "Betaald" : "Open"],
      ],
    },
    {
      title: "Werkgever",
      headers: ["Onderdeel", "Gegeven"],
      widths: [190, 321],
      rows: [
        ["Werkgever", admin.name],
        ["Loonheffingennummer", admin.wageTaxNumber || "-"],
        ["KvK", admin.kvk || "-"],
        ["Vestiging / ondernemer", admin.owner || "-"],
      ],
    },
    {
      title: "Berekening",
      headers: ["Onderdeel", "Bedrag"],
      widths: [340, 171],
      rows: [
        ["Brutoloon", money.format(salary.grossSalary)],
        ["Loonheffing", money.format(salary.wageTax)],
        ["Netto uit te betalen", money.format(salary.netSalary)],
        ["Werkgeversbijdrage Zvw", money.format(salary.employerHealthContribution)],
      ],
    },
  ]);
}

function buildAnnualIncomeStatementPdf(
  admin: Administration,
  employeeName: string,
  salaries: SalaryRecord[],
) {
  const totals = calculateSalaryTotals(salaries);
  const laborTaxCredit = calculateLaborTaxCredit(totals.grossSalary, admin.fiscalYear);
  const firstSalary = salaries[0];
  const employee = firstSalary ? getSalaryEmployee(admin, firstSalary) : null;
  return buildTablePdf(admin, "Jaaropgave", String(admin.fiscalYear), [
    {
      title: "Werknemer",
      headers: ["Onderdeel", "Gegeven"],
      widths: [190, 321],
      rows: [
        ["Werknemer", employee?.name || employeeName],
        ["Geboortedatum", employee?.birthDate || firstSalary?.employeeBirthDate || "-"],
        ["Adres werknemer", employee?.address || firstSalary?.employeeAddress || "-"],
        ["Werkgever", admin.name],
        ["Loonheffingennummer", admin.wageTaxNumber || "-"],
        ["Boekjaar", admin.fiscalYear],
        ["Aantal loontijdvakken", salaries.length],
      ],
    },
    {
      title: "Jaarbedragen",
      headers: ["Onderdeel", "Bedrag"],
      widths: [340, 171],
      rows: [
        ["Fiscaal loon / brutoloon", money.format(totals.grossSalary)],
        ["Ingehouden loonheffing", money.format(totals.wageTax)],
        ["Verrekende arbeidskorting", money.format(laborTaxCredit)],
        ["Netto uitbetaald", money.format(totals.netSalary)],
        ["Werkgeversbijdrage Zvw", money.format(totals.employerHealthContribution)],
      ],
    },
  ]);
}

function buildPayrollOverviewPdf(admin: Administration, salaries: SalaryRecord[]) {
  return buildTablePdf(admin, "Salarisoverzicht", String(admin.fiscalYear), [
    {
      title: "Salarisregels",
      headers: ["Periode", "Werknemer", "Bruto", "Loonheffing", "Netto", "Status"],
      widths: [78, 145, 74, 82, 74, 58],
      rows: salaries.map((salary) => [
        getSalaryMonthLabel(salary.period),
        getSalaryEmployeeName(admin, salary),
        money.format(salary.grossSalary),
        money.format(salary.wageTax),
        money.format(salary.netSalary),
        salary.status === "paid" ? "Betaald" : "Open",
      ]),
      emptyText: "Nog geen salarisregels voor dit boekjaar.",
    },
  ]);
}

export default function Home() {
  const [administrations, setAdministrations] = useState<Administration[]>(starterData);
  const [activeId, setActiveId] = useState(starterData[0].id);
  const [tab, setTab] = useState<TabKey>("overview");
  const [hydrated, setHydrated] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [invoiceDrafts, setInvoiceDrafts] = useState<InvoiceDraft[]>([]);
  const [invoiceImportStatus, setInvoiceImportStatus] = useState("");
  const [contactForm, setContactForm] = useState(emptyContact);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [salaryForm, setSalaryForm] = useState(emptySalary);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [payrollEmployeeForm, setPayrollEmployeeForm] = useState(emptyPayrollEmployee);
  const [editingPayrollEmployeeId, setEditingPayrollEmployeeId] = useState<string | null>(null);
  const [addressLookupStatus, setAddressLookupStatus] = useState("");
  const [kvkQuery, setKvkQuery] = useState("");
  const [kvkStatus, setKvkStatus] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("year");
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("checking");
  const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfile | null>(null);
  const [workspacePin, setWorkspacePin] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Serveropslag nog niet actief");
  const [setupForm, setSetupForm] = useState({
    workspaceName: "BoekBalans",
    email: "",
    pin: "",
  });

  useEffect(() => {
    let cancelled = false;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Administration[];
        if (parsed.length) {
          // Load persisted browser data once before normal auto-save begins.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setAdministrations(parsed);
          setActiveId(parsed[0].id);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    setHydrated(true);

    async function loadWorkspace() {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const data = (await response.json()) as WorkspaceResponse;
        if (cancelled) return;

        if (data.configured && data.profile) {
          setWorkspaceProfile(data.profile);
          setWorkspaceState("locked");
          setSaveStatus("Werkruimte vergrendeld");
        } else {
          setWorkspaceState("setup");
          setSaveStatus("Werkruimte nog niet ingesteld");
        }
      } catch {
        if (!cancelled) {
          setWorkspaceState("setup");
          setWorkspaceError("Serveropslag is nog niet bereikbaar. Je kunt de werkruimte opnieuw proberen in te stellen zodra de preview draait.");
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(storageKey, JSON.stringify(administrations));
    }
  }, [administrations, hydrated]);

  useEffect(() => {
    if (!hydrated || workspaceState !== "unlocked" || !workspacePin) return;

    const timeout = window.setTimeout(async () => {
      try {
        setSaveStatus("Opslaan...");
        const data = await workspaceRequest({
          action: "save",
          pin: workspacePin,
          administrations,
        });
        if (data.profile) setWorkspaceProfile(data.profile);
        setSaveStatus("Opgeslagen op server");
      } catch (error) {
        setSaveStatus(error instanceof Error ? error.message : "Opslaan mislukt");
      }
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [administrations, hydrated, workspacePin, workspaceState]);

  const active = administrations.find((admin) => admin.id === activeId) ?? administrations[0];
  const vatDeductionSettings = getVatDeductionSettings(active);
  const vatDeductionPercent = calculateVatDeductionPercent(vatDeductionSettings);
  const activeSalaries = getAdminSalaries(active);
  const activePayrollEmployees = getPayrollEmployees(active);
  const fiscalYearSalaries = useMemo(
    () => filterSalariesByYear(activeSalaries, active.fiscalYear),
    [activeSalaries, active.fiscalYear],
  );
  const salaryTotals = useMemo(
    () => calculateSalaryTotals(fiscalYearSalaries),
    [fiscalYearSalaries],
  );
  const salaryEmployeeGroups = useMemo(
    () =>
      Array.from(
        fiscalYearSalaries.reduce((groups, salary) => {
          const employee = getSalaryEmployee(active, salary);
          const key = employee?.id ?? `legacy-${salary.employeeName}`;
          const label = employee?.name ?? salary.employeeName;
          const group = groups.get(key) ?? { key, label, salaries: [] as SalaryRecord[] };
          group.salaries.push(salary);
          groups.set(key, group);
          return groups;
        }, new Map<string, { key: string; label: string; salaries: SalaryRecord[] }>()),
      ).map(([, group]) => group),
    [active, fiscalYearSalaries],
  );
  const filteredEntries = useMemo(
    () => filterEntriesByPeriod(active.entries, active.fiscalYear, period),
    [active.entries, active.fiscalYear, period],
  );
  const quarterSummaries = useMemo(
    () => getQuarterSummaries(active.entries, active.fiscalYear, vatDeductionPercent),
    [active.entries, active.fiscalYear, vatDeductionPercent],
  );
  const periodLabel = getPeriodLabel(period);
  const summary = useMemo(
    () => calculateTotals(filteredEntries, vatDeductionPercent),
    [filteredEntries, vatDeductionPercent],
  );
  const profitLossStatement = useMemo(
    () => buildProfitLossStatement(filteredEntries, vatDeductionPercent),
    [filteredEntries, vatDeductionPercent],
  );
  const vatOverview = useMemo(
    () => buildVatOverview(filteredEntries, vatDeductionPercent),
    [filteredEntries, vatDeductionPercent],
  );
  const profit = summary.revenue - summary.costs;
  const vatBalance = summary.vatToPay - summary.vatToClaim;
  const administrationFileBase = `${safeFileName(active.name) || "boekbalans"}-${active.fiscalYear}`;
  const periodFileBase = `${administrationFileBase}-${getPeriodFilePart(period)}`;
  const latestEntries = filteredEntries.slice(0, 4);
  const enteredAmount = Number(entryForm.amount.toString().replace(",", "."));
  const relationSuggestions = active.contacts.filter((contact) =>
    entryForm.type === "income"
      ? contact.type === "customer" || contact.type === "entrepreneur"
      : contact.type === "supplier" || contact.type === "entrepreneur",
  );
  const relationListId = `relations-${entryForm.type}`;
  const showDepreciation = entryForm.type === "expense" && entryForm.category === "Investeringen";
  const canDepreciate =
    showDepreciation &&
    Number.isFinite(enteredAmount) &&
    enteredAmount >= 450;
  const missingSettings = [
    ["Ondernemer", active.owner],
    ["KvK", active.kvk],
    ["Btw-nummer", active.vatNumber],
    ["Loonheffingennummer", active.wageTaxNumber],
    ["IBAN", active.iban],
  ].filter(([, value]) => !String(value).trim());
  const openEntries = filteredEntries.filter((entry) => entry.status === "open");
  const taxableIncomeFromEntries = filteredEntries
    .filter((entry) => entry.type === "income" && entry.vatRate > 0)
    .reduce((total, entry) => total + entry.amount, 0);
  const exemptIncomeFromEntries = filteredEntries
    .filter((entry) => entry.type === "income" && entry.vatRate === 0)
    .reduce((total, entry) => total + entry.amount, 0);
  const openSalaries = fiscalYearSalaries.filter((salary) => salary.status === "open");
  const depreciationCandidates = filteredEntries.filter(
    (entry) =>
      entry.type === "expense" &&
      entry.category === "Investeringen" &&
      entry.amount >= 450 &&
      !entry.depreciationYears,
  );
  const zeroVatEntries = filteredEntries.filter((entry) => entry.vatRate === 0);
  const unknownRelationEntries = filteredEntries.filter(
    (entry) => !entry.relation.trim() || entry.relation === "Onbekende relatie",
  );
  const checkCount =
    missingSettings.length +
    openEntries.length +
    depreciationCandidates.length +
    unknownRelationEntries.length +
    zeroVatEntries.length +
    salaryTotals.openCount;
  const selectedInvoiceDrafts = invoiceDrafts.filter((draft) => draft.selected);
  const bookableInvoiceDrafts = selectedInvoiceDrafts.filter((draft) => {
    const amount = Number(draft.amount.toString().replace(",", "."));
    return draft.description.trim() && Number.isFinite(amount) && amount > 0;
  });

  const updateActive = (next: Administration) => {
    setAdministrations((items) =>
      items.map((admin) => (admin.id === next.id ? next : admin)),
    );
  };

  const addAdministration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = adminName.trim();
    if (!name) return;

    const next: Administration = {
      id: uid(),
      name,
      owner: "",
      kvk: "",
      vatNumber: "",
      fiscalYear: new Date().getFullYear(),
      iban: "",
      entries: [],
      contacts: [],
    };

    setAdministrations((items) => [next, ...items]);
    setActiveId(next.id);
    setTab("overview");
    setAdminName("");
  };

  const addEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(entryForm.amount.toString().replace(",", "."));
    if (!entryForm.description.trim() || !Number.isFinite(amount) || amount <= 0) return;

    const category =
      entryForm.category.trim() || entryCategories[entryForm.type][0] || "Algemeen";

    const depreciationYears =
      entryForm.type === "expense" &&
      category === "Investeringen" &&
      amount >= 450 &&
      entryForm.depreciationYears !== "none"
        ? (Number(entryForm.depreciationYears) as 5 | 10)
        : undefined;

    const entry: Entry = {
      id: editingEntryId ?? uid(),
      date: entryForm.date,
      description: entryForm.description.trim(),
      relation: entryForm.relation.trim() || "Onbekende relatie",
      category,
      type: entryForm.type,
      amount,
      vatRate: Number(entryForm.vatRate),
      status: entryForm.status,
      depreciationYears,
    };

    updateActive({
      ...active,
      entries: editingEntryId
        ? active.entries.map((item) => (item.id === editingEntryId ? entry : item))
        : [entry, ...active.entries],
    });
    setEntryForm({ ...emptyEntry, date: entryForm.date });
    setEditingEntryId(null);
  };

  const readInvoiceFileText = async (file: File) => {
    try {
      const rawText = await file.text();
      const readable = rawText
        .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      const letterCount = (readable.match(/[a-zA-ZÀ-ž]/g) ?? []).length;
      if (readable.length < 30 || letterCount < 12) return "";
      return readable.slice(0, 20000);
    } catch {
      return "";
    }
  };

  const analyzeInvoiceWithAi = async (file: File) => {
    const formData = new FormData();
    formData.set("file", file);
    formData.set(
      "contacts",
      JSON.stringify(
        active.contacts.map((contact) => ({
          name: contact.name,
          type: contact.type,
          kvk: contact.kvk,
        })),
      ),
    );

    const response = await fetch("/api/invoices/analyze", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as {
      result?: InvoiceAiResult;
      error?: string;
    };

    if (!response.ok || !data.result) {
      throw new Error(data.error ?? "AI-herkenning mislukt.");
    }

    return buildAiInvoiceDraft(file, data.result);
  };

  const importInvoiceFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    setInvoiceImportStatus(`${files.length} bestand(en) met AI herkennen...`);
    let aiCount = 0;
    let fallbackCount = 0;
    const fallbackMessages = new Set<string>();
    const drafts = await Promise.all(
      files.map(async (file) => {
        try {
          const draft = await analyzeInvoiceWithAi(file);
          aiCount += 1;
          return draft;
        } catch (error) {
          fallbackCount += 1;
          if (error instanceof Error) fallbackMessages.add(error.message);
          return buildInvoiceDraft(file, await readInvoiceFileText(file), active.contacts);
        }
      }),
    );

    setInvoiceDrafts((items) => [...drafts, ...items]);
    const fallbackText = fallbackCount
      ? ` ${fallbackCount} bestand(en) zijn lokaal voorgesteld${fallbackMessages.size ? `: ${Array.from(fallbackMessages)[0]}` : "."}`
      : "";
    setInvoiceImportStatus(
      `${drafts.length} conceptfactuur/facturen toegevoegd. ${aiCount} via AI.${fallbackText} Controleer de voorstellen.`,
    );
  };

  const updateInvoiceDraft = (
    draftId: string,
    field: keyof InvoiceDraft,
    value: string | boolean,
  ) => {
    setInvoiceDrafts((items) =>
      items.map((draft) => {
        if (draft.id !== draftId) return draft;
        const next = { ...draft, [field]: value };
        if (field === "type") {
          const type = value as EntryType;
          next.category = entryCategories[type][0];
          next.status = type === "income" ? "open" : "paid";
        }
        return next;
      }),
    );
  };

  const removeInvoiceDraft = (draftId: string) => {
    setInvoiceDrafts((items) => items.filter((draft) => draft.id !== draftId));
  };

  const clearInvoiceDrafts = () => {
    setInvoiceDrafts([]);
    setInvoiceImportStatus("Werkvoorraad geleegd.");
  };

  const bookInvoiceDrafts = () => {
    if (!bookableInvoiceDrafts.length) {
      setInvoiceImportStatus("Geen complete geselecteerde facturen om te boeken.");
      return;
    }

    const entries: Entry[] = bookableInvoiceDrafts.map((draft) => ({
      id: uid(),
      date: draft.date || today,
      description: draft.description.trim(),
      relation: draft.relation.trim() || "Onbekende relatie",
      category: draft.category || entryCategories[draft.type][0],
      type: draft.type,
      amount: Number(draft.amount.toString().replace(",", ".")),
      vatRate: Number(draft.vatRate),
      status: draft.status,
    }));

    updateActive({
      ...active,
      entries: [...entries, ...active.entries],
    });
    setInvoiceDrafts((items) =>
      items.filter((draft) => !bookableInvoiceDrafts.some((booked) => booked.id === draft.id)),
    );
    setInvoiceImportStatus(`${entries.length} factuur/facturen geboekt.`);
    setTab("entries");
  };

  const saveContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = contactForm.name.trim();
    if (!nextName) return;

    const existingContact = active.contacts.find((contact) => contact.id === editingContactId);
    const nextContact: Contact = {
      id: editingContactId ?? uid(),
      name: nextName,
      email: contactForm.email.trim(),
      address: contactForm.address.trim(),
      kvk: contactForm.kvk.trim(),
      type: contactForm.type,
    };
    const nextContacts = editingContactId
      ? active.contacts.map((contact) => (contact.id === editingContactId ? nextContact : contact))
      : [nextContact, ...active.contacts];
    const nextEntries =
      existingContact && existingContact.name !== nextName
        ? active.entries.map((entry) =>
            entry.relation === existingContact.name ? { ...entry, relation: nextName } : entry,
          )
        : active.entries;

    updateActive({
      ...active,
      contacts: nextContacts,
      entries: nextEntries,
    });
    setContactForm(emptyContact);
    setEditingContactId(null);
  };

  const searchKvk = async () => {
    const query = kvkQuery.trim();
    if (!query) return;
    setKvkStatus("Zoeken bij KvK...");
    try {
      const response = await fetch(`/api/kvk/search?q=${encodeURIComponent(query)}`);
      const data = (await response.json()) as {
        results?: Array<{ name: string; kvk: string; address: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "KvK zoeken mislukt.");
      const first = data.results?.[0];
      if (!first) {
        setKvkStatus("Geen KvK-resultaat gevonden.");
        return;
      }
      setContactForm({
        ...contactForm,
        name: first.name || contactForm.name,
        kvk: first.kvk || contactForm.kvk,
        address: first.address || contactForm.address,
      });
      setKvkStatus("Eerste KvK-resultaat ingevuld. Controleer de gegevens.");
    } catch (error) {
      setKvkStatus(
        error instanceof Error
          ? error.message
          : "KvK zoeken is nog niet beschikbaar.",
      );
    }
  };

  const saveSalary = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedEmployee = activePayrollEmployees.find(
      (employee) => employee.id === salaryForm.employeeId,
    );
    const grossSalary = Number(salaryForm.grossSalary.toString().replace(",", "."));
    const wageTax = Number(salaryForm.wageTax.toString().replace(",", "."));
    const netSalary = Number(salaryForm.netSalary.toString().replace(",", "."));
    const employerHealthContribution = Number(
      salaryForm.employerHealthContribution.toString().replace(",", "."),
    );
    if (
      !(selectedEmployee || salaryForm.employeeName.trim()) ||
      !salaryForm.period ||
      !Number.isFinite(grossSalary) ||
      !Number.isFinite(wageTax) ||
      !Number.isFinite(netSalary)
    ) {
      return;
    }

    const salary: SalaryRecord = {
      id: editingSalaryId ?? uid(),
      employeeId: selectedEmployee?.id || undefined,
      employeeName: selectedEmployee?.name || salaryForm.employeeName.trim(),
      period: salaryForm.period,
      grossSalary,
      wageTax,
      netSalary,
      employerHealthContribution: Number.isFinite(employerHealthContribution)
        ? employerHealthContribution
        : 0,
      status: salaryForm.status,
      paymentDate: salaryForm.paymentDate,
    };

    updateActive({
      ...active,
      salaries: editingSalaryId
        ? activeSalaries.map((item) => (item.id === editingSalaryId ? salary : item))
        : [salary, ...activeSalaries],
    });
    setSalaryForm({ ...emptySalary, period: salaryForm.period });
    setEditingSalaryId(null);
  };

  const editSalary = (salary: SalaryRecord) => {
    setSalaryForm({
      employeeId: salary.employeeId ?? "",
      employeeName: salary.employeeName,
      period: salary.period,
      grossSalary: String(salary.grossSalary).replace(".", ","),
      wageTax: String(salary.wageTax).replace(".", ","),
      netSalary: String(salary.netSalary).replace(".", ","),
      employerHealthContribution: String(salary.employerHealthContribution).replace(".", ","),
      status: salary.status,
      paymentDate: salary.paymentDate,
    });
    setEditingSalaryId(salary.id);
    setTab("payroll");
  };

  const lookupPayrollAddress = async () => {
    const postalCode = payrollEmployeeForm.postalCode.trim();
    const houseNumber = payrollEmployeeForm.houseNumber.trim();
    if (!postalCode || !houseNumber) {
      setAddressLookupStatus("Vul eerst postcode en huisnummer in.");
      return;
    }

    setAddressLookupStatus("Adres zoeken...");
    try {
      const params = new URLSearchParams({
        postalCode,
        houseNumber,
        addition: payrollEmployeeForm.houseAddition.trim(),
      });
      const response = await fetch(`/api/address/lookup?${params}`);
      const data = (await response.json()) as { address?: string; error?: string };
      if (!response.ok || !data.address) {
        throw new Error(data.error ?? "Adres niet gevonden.");
      }
      setPayrollEmployeeForm({ ...payrollEmployeeForm, address: data.address });
      setAddressLookupStatus("Adres ingevuld. Controleer het adres nog kort.");
    } catch (error) {
      setAddressLookupStatus(
        error instanceof Error ? error.message : "Adres zoeken mislukt.",
      );
    }
  };

  const savePayrollEmployee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = payrollEmployeeForm.name.trim();
    if (!name) return;

    const employee: PayrollEmployee = {
      id: editingPayrollEmployeeId ?? uid(),
      name,
      birthDate: payrollEmployeeForm.birthDate,
      postalCode: payrollEmployeeForm.postalCode.trim(),
      houseNumber: payrollEmployeeForm.houseNumber.trim(),
      houseAddition: payrollEmployeeForm.houseAddition.trim(),
      address: payrollEmployeeForm.address.trim(),
    };

    const previous = activePayrollEmployees.find(
      (item) => item.id === editingPayrollEmployeeId,
    );
    const payrollEmployees = editingPayrollEmployeeId
      ? activePayrollEmployees.map((item) =>
          item.id === editingPayrollEmployeeId ? employee : item,
        )
      : [employee, ...activePayrollEmployees];
    const salaries =
      previous && previous.name !== employee.name
        ? activeSalaries.map((salary) =>
            salary.employeeId === previous.id
              ? { ...salary, employeeName: employee.name }
              : salary,
          )
        : activeSalaries;

    updateActive({
      ...active,
      payrollEmployees,
      salaries,
    });
    setPayrollEmployeeForm(emptyPayrollEmployee);
    setEditingPayrollEmployeeId(null);
    setAddressLookupStatus("");
    if (!salaryForm.employeeId) {
      setSalaryForm({ ...salaryForm, employeeId: employee.id, employeeName: employee.name });
    }
  };

  const editPayrollEmployee = (employee: PayrollEmployee) => {
    setPayrollEmployeeForm({
      name: employee.name,
      birthDate: employee.birthDate,
      postalCode: employee.postalCode,
      houseNumber: employee.houseNumber,
      houseAddition: employee.houseAddition,
      address: employee.address,
    });
    setEditingPayrollEmployeeId(employee.id);
    setAddressLookupStatus("");
  };

  const cancelEditPayrollEmployee = () => {
    setPayrollEmployeeForm(emptyPayrollEmployee);
    setEditingPayrollEmployeeId(null);
    setAddressLookupStatus("");
  };

  const cancelEditSalary = () => {
    setSalaryForm(emptySalary);
    setEditingSalaryId(null);
  };

  const removeSalary = (salaryId: string) => {
    updateActive({
      ...active,
      salaries: activeSalaries.filter((salary) => salary.id !== salaryId),
    });
    if (editingSalaryId === salaryId) cancelEditSalary();
  };

  const editContact = (contact: Contact) => {
    setContactForm({
      name: contact.name,
      email: contact.email || "",
      address: contact.address || "",
      kvk: contact.kvk || "",
      type: contact.type,
    });
    setEditingContactId(contact.id);
    setTab("contacts");
  };

  const cancelEditContact = () => {
    setContactForm(emptyContact);
    setEditingContactId(null);
  };

  const removeContact = (contactId: string) => {
    updateActive({
      ...active,
      contacts: active.contacts.filter((contact) => contact.id !== contactId),
    });
    if (editingContactId === contactId) {
      cancelEditContact();
    }
  };

  const removeEntry = (entryId: string) => {
    updateActive({
      ...active,
      entries: active.entries.filter((entry) => entry.id !== entryId),
    });
    if (editingEntryId === entryId) {
      setEntryForm(emptyEntry);
      setEditingEntryId(null);
    }
  };

  const markSalaryPaid = (salaryId: string) => {
    updateActive({
      ...active,
      salaries: activeSalaries.map((salary) =>
        salary.id === salaryId ? { ...salary, status: "paid" } : salary,
      ),
    });
  };

  const editEntry = (entry: Entry) => {
    setEntryForm({
      date: entry.date,
      description: entry.description,
      relation: entry.relation === "Onbekende relatie" ? "" : entry.relation,
      type: entry.type,
      category: entry.category,
      amount: String(entry.amount).replace(".", ","),
      vatRate: String(entry.vatRate),
      status: entry.status,
      depreciationYears: entry.depreciationYears ? String(entry.depreciationYears) : "none",
    });
    setEditingEntryId(entry.id);
    setTab("entries");
  };

  const cancelEditEntry = () => {
    setEntryForm(emptyEntry);
    setEditingEntryId(null);
  };

  const markEntryPaid = (entryId: string) => {
    updateActive({
      ...active,
      entries: active.entries.map((entry) =>
        entry.id === entryId ? { ...entry, status: "paid" } : entry,
      ),
    });
  };

  const updateSettings = (field: keyof Administration, value: string | number) => {
    updateActive({ ...active, [field]: value });
  };

  const updateVatDeduction = (
    field: keyof VatDeductionSettings,
    value: string | number | boolean | undefined,
  ) => {
    updateActive({
      ...active,
      vatDeduction: {
        ...vatDeductionSettings,
        [field]: value,
      },
    });
  };

  const useVatTurnoverFromEntries = () => {
    updateActive({
      ...active,
      vatDeduction: {
        ...vatDeductionSettings,
        enabled: true,
        taxableTurnover: taxableIncomeFromEntries,
        exemptTurnover: exemptIncomeFromEntries,
        manualPercent: undefined,
      },
    });
  };

  const setupWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorkspaceError("");
    try {
      const data = await workspaceRequest({
        action: "setup",
        workspaceName: setupForm.workspaceName,
        email: setupForm.email,
        pin: setupForm.pin,
        administrations,
      });
      if (data.administrations?.length) {
        setAdministrations(data.administrations);
        setActiveId(data.administrations[0].id);
      }
      if (data.profile) setWorkspaceProfile(data.profile);
      setWorkspacePin(setupForm.pin);
      setWorkspaceState("unlocked");
      setSaveStatus("Werkruimte ingesteld en opgeslagen");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Instellen mislukt");
    }
  };

  const unlockWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorkspaceError("");
    try {
      const data = await workspaceRequest({ action: "login", pin: workspacePin });
      if (data.administrations?.length) {
        setAdministrations(data.administrations);
        setActiveId(data.administrations[0].id);
      }
      if (data.profile) setWorkspaceProfile(data.profile);
      setWorkspaceState("unlocked");
      setSaveStatus("Werkruimte ontgrendeld");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Ontgrendelen mislukt");
    }
  };

  const lockWorkspace = () => {
    setWorkspacePin("");
    setWorkspaceState("locked");
    setSaveStatus("Werkruimte vergrendeld");
  };

  const downloadEntries = () => {
    downloadBlob(`${periodFileBase}-boekingen.pdf`, buildEntriesPdf(active, filteredEntries, periodLabel));
  };

  const downloadReport = () => {
    downloadBlob(`${periodFileBase}-overzicht.pdf`, buildReportPdf(active, summary, periodLabel));
  };

  const downloadProfitLoss = () => {
    downloadBlob(
      `${periodFileBase}-winst-en-verliesrekening.pdf`,
      buildProfitLossPdf(active, profitLossStatement, periodLabel),
    );
  };

  const downloadVatOverview = () => {
    downloadBlob(
      `${periodFileBase}-btw-overzicht.pdf`,
      buildVatOverviewPdf(active, vatOverview, periodLabel),
    );
  };

  const downloadPdfReport = () => {
    downloadBlob(
      `${periodFileBase}-rapport.pdf`,
      buildPdfReport(active, filteredEntries, summary, periodLabel, quarterSummaries),
    );
  };

  const downloadContacts = () => {
    downloadBlob(`${administrationFileBase}-relaties.pdf`, buildContactsPdf(active));
  };

  const downloadPayrollOverview = () => {
    downloadBlob(
      `${administrationFileBase}-salarisoverzicht.pdf`,
      buildPayrollOverviewPdf(active, fiscalYearSalaries),
    );
  };

  const downloadPayslip = (salary: SalaryRecord) => {
    downloadBlob(
      `${administrationFileBase}-${salary.period}-loonstrook-${safeFileName(salary.employeeName)}.pdf`,
      buildPayslipPdf(active, salary),
    );
  };

  const downloadAnnualIncomeStatement = (employeeName: string, employeeSalaries: SalaryRecord[]) => {
    downloadBlob(
      `${administrationFileBase}-jaaropgave-${safeFileName(employeeName)}.pdf`,
      buildAnnualIncomeStatementPdf(active, employeeName, employeeSalaries),
    );
  };

  const downloadBackup = () => {
    downloadTextFile(
      `${administrationFileBase}-backup.json`,
      JSON.stringify(active, null, 2),
      "application/json;charset=utf-8",
    );
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const contents = await file.text();
      const parsed = JSON.parse(contents) as unknown;
      if (!isAdministration(parsed)) {
        setSaveStatus("Backupbestand is geen geldige administratie");
        return;
      }

      const imported = {
        ...parsed,
        id: uid(),
        name: `${parsed.name} (teruggezet)`,
      };

      setAdministrations((items) => [imported, ...items]);
      setActiveId(imported.id);
      setTab("overview");
      setSaveStatus("Backup teruggezet");
    } catch {
      setSaveStatus("Backup terugzetten mislukt");
    }
  };

  if (workspaceState !== "unlocked") {
    return (
      <WorkspaceGate
        error={workspaceError}
        onLogin={unlockWorkspace}
        onSetup={setupWorkspace}
        pin={workspacePin}
        profile={workspaceProfile}
        setPin={setWorkspacePin}
        setSetupForm={setSetupForm}
        setupForm={setupForm}
        state={workspaceState}
      />
    );
  }

  return (
    <>
    <main className="app-shell min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <div className="grid min-h-screen lg:grid-cols-[300px_1fr]">
        <aside className="border-b border-[var(--line)] bg-white/85 px-5 py-5 shadow-sm backdrop-blur lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <div className="brand-mark">BB</div>
            <div>
              <p className="text-xs font-bold uppercase text-[var(--teal)]">
                BoekBalans
              </p>
              <h1 className="text-xl font-semibold">Werkboekhouding</h1>
            </div>
          </div>

          <div className="workspace-card">
            <p className="eyebrow">{workspaceProfile?.workspaceName ?? "Werkruimte"}</p>
            <p className="mt-1 text-sm font-semibold">{saveStatus}</p>
            {workspaceProfile?.updatedAt ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Laatste opslag: {new Date(workspaceProfile.updatedAt).toLocaleString("nl-NL")}
              </p>
            ) : null}
            <button className="soft-button mt-3 w-full justify-center" onClick={lockWorkspace}>
              Vergrendel
            </button>
          </div>

          <form className="mt-6 grid gap-2" onSubmit={addAdministration}>
            <label className="text-xs font-bold uppercase text-[var(--muted)]">
              Administraties
            </label>
            <div className="flex gap-2">
              <input
                aria-label="Nieuwe administratie"
                className="input min-w-0 flex-1"
                onChange={(event) => setAdminName(event.target.value)}
                placeholder="Nieuwe administratie"
                value={adminName}
              />
              <button className="primary-button px-3 py-2 text-sm">Nieuw</button>
            </div>
          </form>

          <nav className="mt-5 space-y-2">
            {administrations.map((admin) => (
              <button
                className={`admin-switch ${admin.id === active.id ? "is-active" : ""}`}
                key={admin.id}
                onClick={() => {
                  setActiveId(admin.id);
                  setTab("overview");
                }}
              >
                <span className="block text-sm font-semibold">{admin.name}</span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {admin.entries.length} boekingen, {getAdminSalaries(admin).length} salarisregels
                </span>
              </button>
            ))}
          </nav>

          <div className="mt-6 rounded-lg bg-[var(--mint)] p-4">
            <p className="text-sm font-semibold">Snelle export</p>
            <button className="soft-button mt-3 w-full justify-center" onClick={() => setTab("reports")}>
              Naar downloads
            </button>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-5 md:px-8">
          <header className="hero-panel">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--teal)]">
                Actieve administratie
              </p>
              <h2 className="mt-1 text-3xl font-semibold md:text-4xl">{active.name}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                Een rustige werkplek voor boeken, controleren en overzichten downloaden.
              </p>
            </div>
            <div className="action-row">
              <label className="period-control">
                <span>Periode</span>
                <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>
                  {periodOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-button" onClick={() => setTab("reports")}>
                Downloads openen
              </button>
            </div>
          </header>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Omzet" value={money.format(summary.revenue)} accent="teal" />
            <Metric label="Kosten" value={money.format(summary.costs)} accent="coral" />
            <Metric
              label="Resultaat"
              value={money.format(profit)}
              accent={profit >= 0 ? "blue" : "coral"}
            />
            <Metric label="Open posten" value={money.format(summary.open)} accent="yellow" />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              ["overview", "Dashboard"],
              ["entries", "Boekingen"],
              ["invoices", "Facturen"],
              ["payroll", "Salarissen"],
              ["checks", checkCount ? `Controle (${checkCount})` : "Controle"],
              ["reports", "Downloads"],
              ["contacts", "Relaties"],
              ["settings", "Instellingen"],
            ].map(([key, label]) => (
              <button
                className={`tab-button ${tab === key ? "is-active" : ""}`}
                key={key}
                onClick={() => setTab(key as TabKey)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{periodLabel} · {active.fiscalYear}</p>
                    <h3>Financiele stand</h3>
                  </div>
                  <span className="status-pill">
                    {summary.openCount ? `${summary.openCount} open` : "Alles betaald"}
                  </span>
                </div>

                <div className="mt-5 h-64 rounded-lg border border-[var(--line)] bg-white p-4">
                  <div className="flex h-full items-end gap-4">
                    <Bar label="Omzet" value={summary.revenue} max={Math.max(summary.revenue, summary.costs, profit, 1)} color="var(--teal)" />
                    <Bar label="Kosten" value={summary.costs} max={Math.max(summary.revenue, summary.costs, profit, 1)} color="var(--coral)" />
                    <Bar label="Resultaat" value={Math.max(profit, 0)} max={Math.max(summary.revenue, summary.costs, profit, 1)} color="var(--blue)" />
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Vandaag handig</p>
                    <h3>Aandacht nodig</h3>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <Notice
                    label="Btw saldo"
                    text={`${money.format(Math.abs(vatBalance))} ${vatBalance >= 0 ? "te betalen" : "terug te vragen"}`}
                  />
                  <Notice
                    label="Open posten"
                    text={`${summary.openCount} boekingen staan nog open`}
                  />
                  <Notice
                    label="Relaties"
                    text={`${active.contacts.length} klanten en leveranciers vastgelegd`}
                  />
                  <Notice
                    label="Afschrijvingen"
                    text={`${summary.depreciationCount} investering(en), ${money.format(summary.annualDepreciation)} per jaar`}
                  />
                </div>
              </section>

              <section className="panel xl:col-span-2">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Recente activiteit</p>
                    <h3>Laatste boekingen</h3>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{periodLabel}</p>
                  </div>
                  <button className="secondary-button" onClick={() => setTab("entries")}>
                    Alles bekijken
                  </button>
                </div>
                <CompactEntries entries={latestEntries} />
              </section>
            </div>
          )}

          {tab === "entries" && (
            <div className="mt-6 grid gap-5">
              <section className="panel entry-workbench">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{editingEntryId ? "Correctie" : "Nieuwe regel"}</p>
                    <h3>{editingEntryId ? "Boeking bewerken" : "Boeking toevoegen"}</h3>
                  </div>
                  {editingEntryId ? (
                    <button className="ghost-button" onClick={cancelEditEntry} type="button">
                      Annuleer
                    </button>
                  ) : null}
                </div>
                <form className="mt-4 grid gap-3" onSubmit={addEntry}>
                  <div className="segmented-control">
                    <button
                      className={entryForm.type === "income" ? "is-active" : ""}
                      onClick={() =>
                        setEntryForm({
                          ...entryForm,
                          type: "income",
                          category: entryCategories.income[0],
                          relation: "",
                          depreciationYears: "none",
                        })
                      }
                      type="button"
                    >
                      Inkomsten
                    </button>
                    <button
                      className={entryForm.type === "expense" ? "is-active" : ""}
                      onClick={() =>
                        setEntryForm({
                          ...entryForm,
                          type: "expense",
                          category: entryCategories.expense[0],
                          relation: "",
                          depreciationYears: "none",
                        })
                      }
                      type="button"
                    >
                      Uitgaven
                    </button>
                  </div>
                  <div className="entry-form-grid">
                  <Field label="Datum">
                    <input className="input" type="date" value={entryForm.date} onChange={(event) => setEntryForm({ ...entryForm, date: event.target.value })} />
                  </Field>
                  <Field label="Omschrijving">
                    <input className="input" value={entryForm.description} onChange={(event) => setEntryForm({ ...entryForm, description: event.target.value })} />
                  </Field>
                  <Field label="Relatie">
                    <input
                      className="input"
                      list={relationListId}
                      placeholder="Kies of typ een relatie"
                      value={entryForm.relation}
                      onChange={(event) => setEntryForm({ ...entryForm, relation: event.target.value })}
                    />
                    <datalist id={relationListId}>
                      {relationSuggestions.map((contact) => (
                        <option key={contact.id} value={contact.name}>
                          {contact.type === "customer" ? "Klant" : "Leverancier"}
                          {contact.kvk ? ` · KvK ${contact.kvk}` : ""}
                        </option>
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Categorie">
                    <select
                      className="input"
                      value={entryForm.category}
                      onChange={(event) => {
                        const category = event.target.value;
                        setEntryForm({
                          ...entryForm,
                          category,
                          depreciationYears: category === "Investeringen" ? entryForm.depreciationYears : "none",
                        });
                      }}
                    >
                      {entryCategories[entryForm.type].map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Bedrag excl. btw">
                    <input className="input" inputMode="decimal" value={entryForm.amount} onChange={(event) => setEntryForm({ ...entryForm, amount: event.target.value })} />
                  </Field>
                  <Field label="Btw">
                    <select className="input" value={entryForm.vatRate} onChange={(event) => setEntryForm({ ...entryForm, vatRate: event.target.value })}>
                      <option value="21">21%</option>
                      <option value="9">9%</option>
                      <option value="0">0%</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className="input" value={entryForm.status} onChange={(event) => setEntryForm({ ...entryForm, status: event.target.value as EntryStatus })}>
                      <option value="paid">Betaald</option>
                      <option value="open">Open</option>
                    </select>
                  </Field>
                  </div>
                  {showDepreciation && (
                    <Field label="Afschrijving">
                      <select
                        className="input"
                        value={canDepreciate ? entryForm.depreciationYears : "none"}
                        onChange={(event) =>
                          setEntryForm({
                            ...entryForm,
                            depreciationYears: event.target.value,
                          })
                        }
                        disabled={!canDepreciate}
                      >
                        <option value="none">
                          {canDepreciate
                            ? "Niet afschrijven"
                            : "Vanaf € 450 excl. btw"}
                        </option>
                        <option value="5">Afschrijven in 5 jaar</option>
                        <option value="10">Afschrijven in 10 jaar</option>
                      </select>
                      <span className="text-xs font-medium text-[var(--muted)]">
                        Investeringen vanaf € 450 exclusief btw kun je over meerdere jaren verdelen.
                      </span>
                    </Field>
                  )}
                  <button className="primary-button mt-2 justify-center py-3 md:w-fit">
                    {editingEntryId ? "Wijziging opslaan" : "Boeking opslaan"}
                  </button>
                </form>
              </section>

              <EntryTable
                entries={filteredEntries}
                onEdit={editEntry}
                onRemove={removeEntry}
                onDownload={downloadEntries}
                periodLabel={periodLabel}
              />
            </div>
          )}

          {tab === "invoices" && (
            <InvoiceImportPanel
              bookableCount={bookableInvoiceDrafts.length}
              contacts={active.contacts}
              drafts={invoiceDrafts}
              importStatus={invoiceImportStatus}
              onBookSelected={bookInvoiceDrafts}
              onClear={clearInvoiceDrafts}
              onImport={importInvoiceFiles}
              onRemove={removeInvoiceDraft}
              onUpdate={updateInvoiceDraft}
              selectedCount={selectedInvoiceDrafts.length}
            />
          )}

          {tab === "payroll" && (
            <div className="mt-6 grid gap-5">
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Brutoloon" value={money.format(salaryTotals.grossSalary)} accent="teal" />
                <Metric label="Loonheffing" value={money.format(salaryTotals.wageTax)} accent="coral" />
                <Metric label="Netto loon" value={money.format(salaryTotals.netSalary)} accent="blue" />
                <Metric label="Open salarissen" value={String(salaryTotals.openCount)} accent="yellow" />
              </div>

              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Eenmalig vastleggen</p>
                    <h3>DGA-gegevens</h3>
                  </div>
                  {editingPayrollEmployeeId ? (
                    <button className="ghost-button" onClick={cancelEditPayrollEmployee} type="button">
                      Annuleer
                    </button>
                  ) : null}
                </div>
                <form className="mt-4 grid gap-3" onSubmit={savePayrollEmployee}>
                  <div className="payroll-employee-grid">
                    <Field label="Naam DGA / werknemer">
                      <input
                        className="input"
                        value={payrollEmployeeForm.name}
                        onChange={(event) =>
                          setPayrollEmployeeForm({ ...payrollEmployeeForm, name: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Geboortedatum">
                      <input
                        className="input"
                        type="date"
                        value={payrollEmployeeForm.birthDate}
                        onChange={(event) =>
                          setPayrollEmployeeForm({ ...payrollEmployeeForm, birthDate: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Postcode">
                      <input
                        className="input"
                        placeholder="1234 AB"
                        value={payrollEmployeeForm.postalCode}
                        onChange={(event) =>
                          setPayrollEmployeeForm({ ...payrollEmployeeForm, postalCode: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Huisnummer">
                      <input
                        className="input"
                        inputMode="numeric"
                        value={payrollEmployeeForm.houseNumber}
                        onChange={(event) =>
                          setPayrollEmployeeForm({ ...payrollEmployeeForm, houseNumber: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Toevoeging">
                      <input
                        className="input"
                        placeholder="A"
                        value={payrollEmployeeForm.houseAddition}
                        onChange={(event) =>
                          setPayrollEmployeeForm({ ...payrollEmployeeForm, houseAddition: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Adres">
                      <input
                        className="input"
                        value={payrollEmployeeForm.address}
                        onChange={(event) =>
                          setPayrollEmployeeForm({ ...payrollEmployeeForm, address: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="secondary-button" onClick={lookupPayrollAddress} type="button">
                      Vul adres automatisch
                    </button>
                    <button className="primary-button justify-center py-3 md:w-fit">
                      {editingPayrollEmployeeId ? "DGA-gegevens opslaan" : "DGA toevoegen"}
                    </button>
                    <span className="text-xs font-medium text-[var(--muted)]">
                      {addressLookupStatus || "Vul postcode en huisnummer in om het adres op te halen."}
                    </span>
                  </div>
                </form>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {activePayrollEmployees.map((employee) => (
                    <div className="payroll-person-card" key={employee.id}>
                      <div>
                        <strong>{employee.name}</strong>
                        <span>{employee.birthDate || "Geen geboortedatum"}</span>
                        <span>{employee.address || "Geen adres"}</span>
                      </div>
                      <button className="ghost-button" onClick={() => editPayrollEmployee(employee)}>
                        Bewerk
                      </button>
                    </div>
                  ))}
                  {!activePayrollEmployees.length ? (
                    <p className="rounded-lg bg-white p-4 text-sm text-[var(--muted)]">
                      Leg eerst de DGA vast. Daarna kun je bij elke salarisregel alleen de DGA kiezen.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{editingSalaryId ? "Correctie" : "Nieuwe salarisregel"}</p>
                    <h3>{editingSalaryId ? "Salaris bewerken" : "DGA-salaris registreren"}</h3>
                  </div>
                  {editingSalaryId ? (
                    <button className="ghost-button" onClick={cancelEditSalary} type="button">
                      Annuleer
                    </button>
                  ) : null}
                </div>
                <form className="mt-4 grid gap-3" onSubmit={saveSalary}>
                  <div className="salary-form-grid">
                    <Field label="DGA / werknemer">
                      <select
                        className="input"
                        value={salaryForm.employeeId}
                        onChange={(event) => {
                          const employee = activePayrollEmployees.find(
                            (item) => item.id === event.target.value,
                          );
                          setSalaryForm({
                            ...salaryForm,
                            employeeId: event.target.value,
                            employeeName: employee?.name ?? "",
                          });
                        }}
                      >
                        <option value="">Kies DGA / werknemer</option>
                        {activePayrollEmployees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Periode">
                      <input
                        className="input"
                        type="month"
                        value={salaryForm.period}
                        onChange={(event) => setSalaryForm({ ...salaryForm, period: event.target.value })}
                      />
                    </Field>
                    <Field label="Brutoloon">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={salaryForm.grossSalary}
                        onChange={(event) => setSalaryForm({ ...salaryForm, grossSalary: event.target.value })}
                      />
                    </Field>
                    <Field label="Loonheffing">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={salaryForm.wageTax}
                        onChange={(event) => setSalaryForm({ ...salaryForm, wageTax: event.target.value })}
                      />
                    </Field>
                    <Field label="Netto loon">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={salaryForm.netSalary}
                        onChange={(event) => setSalaryForm({ ...salaryForm, netSalary: event.target.value })}
                      />
                    </Field>
                    <Field label="Werkgeversbijdrage Zvw">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={salaryForm.employerHealthContribution}
                        onChange={(event) =>
                          setSalaryForm({ ...salaryForm, employerHealthContribution: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Betaaldatum">
                      <input
                        className="input"
                        type="date"
                        value={salaryForm.paymentDate}
                        onChange={(event) => setSalaryForm({ ...salaryForm, paymentDate: event.target.value })}
                      />
                    </Field>
                    <Field label="Status">
                      <select
                        className="input"
                        value={salaryForm.status}
                        onChange={(event) => setSalaryForm({ ...salaryForm, status: event.target.value as EntryStatus })}
                      >
                        <option value="paid">Betaald</option>
                        <option value="open">Open</option>
                      </select>
                    </Field>
                  </div>
                  <button className="primary-button mt-2 justify-center py-3 md:w-fit">
                    {editingSalaryId ? "Salaris opslaan" : "Salaris toevoegen"}
                  </button>
                </form>
              </section>

              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{fiscalYearSalaries.length} salarisregels · {active.fiscalYear}</p>
                    <h3>Loonstroken en jaaropgaven</h3>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-xs font-bold uppercase text-[var(--muted)]">
                        <th className="py-3 pr-3">Periode</th>
                        <th className="py-3 pr-3">DGA / werknemer</th>
                        <th className="py-3 pr-3">Bruto</th>
                        <th className="py-3 pr-3">Loonheffing</th>
                        <th className="py-3 pr-3">Netto</th>
                        <th className="py-3 pr-3">Status</th>
                        <th className="py-3 pr-3">Actie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fiscalYearSalaries.map((salary) => (
                        <tr className="border-b border-[var(--line)] last:border-b-0" key={salary.id}>
                          <td className="py-3 pr-3">{getSalaryMonthLabel(salary.period)}</td>
                          <td className="py-3 pr-3">
                            <strong>{getSalaryEmployeeName(active, salary)}</strong>
                            <span className="mt-1 block text-xs text-[var(--muted)]">
                              {getSalaryEmployeeBirthDate(active, salary) || "Geen geboortedatum"} · {getSalaryEmployeeAddress(active, salary) || "Geen adres"}
                            </span>
                            <span className="mt-1 block text-xs text-[var(--muted)]">
                              Betaaldatum {salary.paymentDate || "-"}
                            </span>
                          </td>
                          <td className="py-3 pr-3">{money.format(salary.grossSalary)}</td>
                          <td className="py-3 pr-3">{money.format(salary.wageTax)}</td>
                          <td className="py-3 pr-3">{money.format(salary.netSalary)}</td>
                          <td className="py-3 pr-3">{salary.status === "paid" ? "Betaald" : "Open"}</td>
                          <td className="py-3 pr-3">
                            <div className="flex flex-wrap gap-2">
                              <button className="ghost-button" onClick={() => downloadPayslip(salary)}>
                                Loonstrook
                              </button>
                              {salary.status === "open" ? (
                                <button className="ghost-button" onClick={() => markSalaryPaid(salary.id)}>
                                  Betaald
                                </button>
                              ) : null}
                              <button className="ghost-button" onClick={() => editSalary(salary)}>
                                Bewerk
                              </button>
                              <button className="ghost-button" onClick={() => removeSalary(salary.id)}>
                                Verwijder
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!fiscalYearSalaries.length && (
                    <p className="py-6 text-sm text-[var(--muted)]">
                      Nog geen salarissen voor dit boekjaar.
                    </p>
                  )}
                </div>
                {salaryEmployeeGroups.length ? (
                  <div className="mt-5 grid gap-2 border-t border-[var(--line)] pt-4 md:grid-cols-2 xl:grid-cols-3">
                    {salaryEmployeeGroups.map((group) => (
                      <button
                        className="secondary-button justify-center"
                        key={group.key}
                        onClick={() => downloadAnnualIncomeStatement(group.label, group.salaries)}
                      >
                        Jaaropgave {group.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          )}

          {tab === "checks" && (
            <div className="mt-6 grid gap-5 xl:grid-cols-4">
              <Metric label="Aandachtspunten" value={String(checkCount)} accent={checkCount ? "coral" : "teal"} />
              <Metric label="Open posten" value={String(openEntries.length)} accent="yellow" />
              <Metric label="Afschrijving check" value={String(depreciationCandidates.length)} accent="blue" />
              <Metric label="Open salarissen" value={String(openSalaries.length)} accent="yellow" />

              <section className="panel xl:col-span-2">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{periodLabel}</p>
                    <h3>Open posten</h3>
                  </div>
                  <button className="secondary-button" onClick={() => setTab("entries")}>
                    Naar boekingen
                  </button>
                </div>
                <CheckRows emptyText="Geen open posten in deze periode.">
                  {openEntries.map((entry) => (
                    <CheckRow
                      key={entry.id}
                      title={entry.description}
                      meta={`${entry.date} · ${entry.relation} · ${money.format(entry.amount * (1 + entry.vatRate / 100))} incl. btw`}
                    >
                      <button className="soft-button" onClick={() => markEntryPaid(entry.id)}>
                        Markeer betaald
                      </button>
                    </CheckRow>
                  ))}
                </CheckRows>
              </section>

              <section className="panel xl:col-span-2">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Salarissen · {active.fiscalYear}</p>
                    <h3>Open salarisbetalingen</h3>
                  </div>
                  <button className="secondary-button" onClick={() => setTab("payroll")}>
                    Naar salarissen
                  </button>
                </div>
                <CheckRows emptyText="Geen open salarisbetalingen.">
                  {openSalaries.map((salary) => (
                    <CheckRow
                      key={salary.id}
                      title={`${salary.employeeName} · ${getSalaryMonthLabel(salary.period)}`}
                      meta={`${money.format(salary.netSalary)} netto · betaaldatum ${salary.paymentDate || "-"}`}
                    >
                      <button className="soft-button" onClick={() => markSalaryPaid(salary.id)}>
                        Markeer betaald
                      </button>
                    </CheckRow>
                  ))}
                </CheckRows>
              </section>

              <section className="panel xl:col-span-2">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Basisgegevens</p>
                    <h3>Administratie compleet</h3>
                  </div>
                  <button className="secondary-button" onClick={() => setTab("settings")}>
                    Naar instellingen
                  </button>
                </div>
                <CheckRows emptyText="Alle basisgegevens zijn ingevuld.">
                  {missingSettings.map(([label]) => (
                    <CheckRow
                      key={label}
                      title={`${label} ontbreekt`}
                      meta="Vul dit aan voor nette exports en overdracht."
                    />
                  ))}
                </CheckRows>
              </section>

              <section className="panel xl:col-span-2">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Investeringen</p>
                    <h3>Afschrijving controleren</h3>
                  </div>
                  <button className="secondary-button" onClick={() => setTab("entries")}>
                    Naar boekingen
                  </button>
                </div>
                <CheckRows emptyText="Geen uitgaven boven € 450 zonder afschrijving in deze periode.">
                  {depreciationCandidates.map((entry) => (
                    <CheckRow
                      key={entry.id}
                      title={entry.description}
                      meta={`${entry.date} · ${entry.category} · ${money.format(entry.amount)} excl. btw`}
                    />
                  ))}
                </CheckRows>
              </section>

              <section className="panel xl:col-span-2">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Boekingen</p>
                    <h3>Extra aandacht</h3>
                  </div>
                </div>
                <CheckRows emptyText="Geen boekingen met extra aandachtspunten in deze periode.">
                  {unknownRelationEntries.map((entry) => (
                    <CheckRow
                      key={`relation-${entry.id}`}
                      title="Relatie ontbreekt"
                      meta={`${entry.date} · ${entry.description}`}
                    />
                  ))}
                  {zeroVatEntries.map((entry) => (
                    <CheckRow
                      key={`vat-${entry.id}`}
                      title="Btw 0%"
                      meta={`${entry.date} · ${entry.description} · controleer of dit klopt`}
                    />
                  ))}
                </CheckRows>
              </section>
            </div>
          )}

          {tab === "reports" && (
            <div className="mt-6 grid gap-5 xl:grid-cols-3">
              <DownloadCard
                title="Financieel overzicht"
                text="Omzet, kosten, resultaat, btw en open posten in een compact PDF-bestand."
                button="Download PDF"
                onClick={downloadReport}
              />
              <DownloadCard
                title="Winst- en verliesrekening"
                text="Opbrengsten, kosten, afschrijvingen en resultaat voor de gekozen periode."
                button="Download PDF"
                onClick={downloadProfitLoss}
              />
              <DownloadCard
                title="Btw-overzicht"
                text="Grondslag, verschuldigde omzetbelasting, voorbelasting en saldo btw."
                button="Download PDF"
                onClick={downloadVatOverview}
              />
              <DownloadCard
                title="PDF-rapport"
                text="Download direct een PDF-rapport voor de gekozen periode."
                button="Download PDF"
                onClick={downloadPdfReport}
              />
              <DownloadCard
                title="Alle boekingen"
                text="Een volledige export van de regels inclusief btw-bedragen en betaalstatus."
                button="Download PDF"
                onClick={downloadEntries}
              />
              <DownloadCard
                title="Relaties"
                text="Klanten en leveranciers, handig voor controle of overdracht."
                button="Download PDF"
                onClick={downloadContacts}
              />
              <DownloadCard
                title="Salarisoverzicht"
                text="Alle salarisregels van het boekjaar met bruto, loonheffing en netto loon."
                button="Download PDF"
                onClick={downloadPayrollOverview}
              />
              <section className="panel xl:col-span-3">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Gemengde btw · {periodLabel}</p>
                    <h3>Aftrekbare voorbelasting berekenen</h3>
                  </div>
                  <span className="status-pill">
                    {vatDeductionSettings.enabled
                      ? `${vatDeductionPercent.toFixed(1)}% aftrekbaar`
                      : "100% aftrekbaar"}
                  </span>
                </div>
                <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="vat-tool-grid">
                    <label className="toggle-line">
                      <input
                        checked={vatDeductionSettings.enabled}
                        onChange={(event) => updateVatDeduction("enabled", event.target.checked)}
                        type="checkbox"
                      />
                      <span>Deze administratie heeft ook btw-vrijgestelde omzet</span>
                    </label>
                    <Field label="Btw-belaste omzet">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={vatDeductionSettings.taxableTurnover || ""}
                        onChange={(event) =>
                          updateVatDeduction(
                            "taxableTurnover",
                            Number(event.target.value.replace(",", ".")) || 0,
                          )
                        }
                      />
                    </Field>
                    <Field label="Btw-vrijgestelde omzet">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={vatDeductionSettings.exemptTurnover || ""}
                        onChange={(event) =>
                          updateVatDeduction(
                            "exemptTurnover",
                            Number(event.target.value.replace(",", ".")) || 0,
                          )
                        }
                      />
                    </Field>
                    <Field label="Handmatig percentage">
                      <input
                        className="input"
                        inputMode="decimal"
                        placeholder="Leeg = automatisch"
                        value={vatDeductionSettings.manualPercent ?? ""}
                        onChange={(event) => {
                          const value = event.target.value.trim();
                          updateVatDeduction(
                            "manualPercent",
                            value ? Number(value.replace(",", ".")) : undefined,
                          );
                        }}
                      />
                    </Field>
                    <button className="secondary-button justify-center" onClick={useVatTurnoverFromEntries}>
                      Neem omzet uit boekingen over
                    </button>
                  </div>
                  <div className="vat-result-card">
                    <p className="eyebrow">Doorwerking</p>
                    <dl className="mt-4 grid gap-3 text-sm">
                      <div className="summary-line">
                        <dt>Betaalde btw op kosten</dt>
                        <dd>{money.format(summary.inputVatTotal)}</dd>
                      </div>
                      <div className="summary-line">
                        <dt>Aftrekbare voorbelasting</dt>
                        <dd>{money.format(summary.vatToClaim)}</dd>
                      </div>
                      <div className="summary-line">
                        <dt>Niet-aftrekbare btw naar kosten</dt>
                        <dd>{money.format(summary.nonDeductibleVat)}</dd>
                      </div>
                      <div className="summary-line">
                        <dt>Aftrekpercentage</dt>
                        <dd>{vatDeductionPercent.toFixed(2)}%</dd>
                      </div>
                    </dl>
                    <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                      Het niet-aftrekbare deel wordt automatisch als kosten meegenomen in de winst- en verliesrekening.
                    </p>
                  </div>
                </div>
              </section>
              <ProfitLossPanel statement={profitLossStatement} periodLabel={periodLabel} />
              <section className="panel xl:col-span-2">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Btw-overzicht · {periodLabel}</p>
                    <h3>Aangiftevoorbereiding</h3>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Ontvangen btw" value={money.format(summary.vatToPay)} accent="teal" />
                  <Metric label="Aftrekbare btw" value={money.format(summary.vatToClaim)} accent="blue" />
                  <Metric label="Niet aftrekbaar" value={money.format(summary.nonDeductibleVat)} accent="yellow" />
                  <Metric
                    label={vatBalance >= 0 ? "Te betalen" : "Terug te vragen"}
                    value={money.format(Math.abs(vatBalance))}
                    accent={vatBalance >= 0 ? "coral" : "blue"}
                  />
                </div>
                <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                  {summary.depreciationCount
                    ? `${summary.depreciationCount} investering(en) worden verdeeld over 5 of 10 jaar.`
                    : "Nog geen investeringen met afschrijving vastgelegd."}
                </p>
              </section>
              <QuarterOverview quarters={quarterSummaries} />
              <section className="panel">
                <p className="eyebrow">Eigen kopie</p>
                <h3>Backup</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Download de actieve administratie als JSON-bestand of zet later zo&apos;n bestand terug als nieuwe administratie.
                </p>
                <button className="secondary-button mt-5 w-full justify-center" onClick={downloadBackup}>
                  Download backup
                </button>
                <label className="secondary-button mt-3 w-full justify-center">
                  Backup terugzetten
                  <input
                    accept="application/json"
                    className="sr-only"
                    onChange={importBackup}
                    type="file"
                  />
                </label>
              </section>
            </div>
          )}

          {tab === "contacts" && (
            <div className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Adresboek</p>
                    <h3>{editingContactId ? "Relatie bewerken" : "Relatie toevoegen"}</h3>
                  </div>
                </div>
                <form className="mt-4 grid gap-3" onSubmit={saveContact}>
                  <Field label="Naam">
                    <input className="input" value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} />
                  </Field>
                  <div className="kvk-search-box">
                    <Field label="Zoeken bij KvK">
                      <div className="flex gap-2">
                        <input
                          className="input min-w-0 flex-1"
                          onChange={(event) => setKvkQuery(event.target.value)}
                          placeholder="Bedrijfsnaam of KvK-nummer"
                          value={kvkQuery}
                        />
                        <button className="secondary-button" onClick={searchKvk} type="button">
                          Zoek
                        </button>
                      </div>
                    </Field>
                    <p className="mt-2 text-xs font-medium text-[var(--muted)]">
                      {kvkStatus || "Met een KvK API-sleutel kan BoekBalans relaties automatisch aanvullen."}
                    </p>
                  </div>
                  <Field label="E-mail">
                    <input className="input" type="email" value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} />
                  </Field>
                  <Field label="Vestigingsadres">
                    <input className="input" value={contactForm.address} onChange={(event) => setContactForm({ ...contactForm, address: event.target.value })} />
                  </Field>
                  <Field label="KvK-nummer">
                    <input className="input" value={contactForm.kvk} onChange={(event) => setContactForm({ ...contactForm, kvk: event.target.value })} />
                  </Field>
                  <Field label="Soort">
                    <select className="input" value={contactForm.type} onChange={(event) => setContactForm({ ...contactForm, type: event.target.value as Contact["type"] })}>
                      <option value="customer">Klant</option>
                      <option value="supplier">Leverancier</option>
                      <option value="entrepreneur">Ondernemer</option>
                    </select>
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button className="primary-button justify-center py-3">
                      {editingContactId ? "Wijziging opslaan" : "Relatie opslaan"}
                    </button>
                    {editingContactId && (
                      <button className="secondary-button justify-center py-3" onClick={cancelEditContact} type="button">
                        Annuleer
                      </button>
                    )}
                  </div>
                </form>
              </section>
              <section className="panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">{active.contacts.length} relaties</p>
                    <h3>Klanten en leveranciers</h3>
                  </div>
                  <button className="secondary-button" onClick={downloadContacts}>
                    Download
                  </button>
                </div>
                <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)]">
                  {active.contacts.map((contact) => (
                    <div className="relation-row" key={contact.id}>
                      <div className="min-w-0">
                        <strong className="block">{contact.name}</strong>
                        <span className="mt-1 block text-sm text-[var(--muted)]">{contact.email || "Geen e-mail"}</span>
                        <span className="mt-1 block text-xs text-[var(--muted)]">
                          {contact.address || "Geen vestigingsadres"}
                          {contact.kvk ? ` · KvK ${contact.kvk}` : " · Geen KvK"}
                        </span>
                      </div>
                      <span className="type-pill">{contactTypeLabel(contact.type)}</span>
                      <div className="flex flex-wrap gap-2">
                        <button className="ghost-button" onClick={() => editContact(contact)}>
                          Bewerk
                        </button>
                        <button className="ghost-button" onClick={() => removeContact(contact.id)}>
                          Verwijder
                        </button>
                      </div>
                    </div>
                  ))}
                  {!active.contacts.length && <p className="p-4 text-sm text-[var(--muted)]">Nog geen relaties.</p>}
                </div>
              </section>
            </div>
          )}

          {tab === "settings" && (
            <section className="panel mt-6">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Basisgegevens</p>
                  <h3>Administratiegegevens</h3>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Naam administratie">
                  <input className="input" value={active.name} onChange={(event) => updateSettings("name", event.target.value)} />
                </Field>
                <Field label="Ondernemer">
                  <input className="input" value={active.owner} onChange={(event) => updateSettings("owner", event.target.value)} />
                </Field>
                <Field label="KvK">
                  <input className="input" value={active.kvk} onChange={(event) => updateSettings("kvk", event.target.value)} />
                </Field>
                <Field label="Btw-nummer">
                  <input className="input" value={active.vatNumber} onChange={(event) => updateSettings("vatNumber", event.target.value)} />
                </Field>
                <Field label="Loonheffingennummer">
                  <input className="input" value={active.wageTaxNumber ?? ""} onChange={(event) => updateSettings("wageTaxNumber", event.target.value)} />
                </Field>
                <Field label="Boekjaar">
                  <input className="input" type="number" value={active.fiscalYear} onChange={(event) => updateSettings("fiscalYear", Number(event.target.value))} />
                </Field>
                <Field label="IBAN">
                  <input className="input" value={active.iban} onChange={(event) => updateSettings("iban", event.target.value)} />
                </Field>
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
    </>
  );
}

function WorkspaceGate({
  error,
  onLogin,
  onSetup,
  pin,
  profile,
  setPin,
  setSetupForm,
  setupForm,
  state,
}: {
  error: string;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onSetup: (event: FormEvent<HTMLFormElement>) => void;
  pin: string;
  profile: WorkspaceProfile | null;
  setPin: (pin: string) => void;
  setSetupForm: (form: { workspaceName: string; email: string; pin: string }) => void;
  setupForm: { workspaceName: string; email: string; pin: string };
  state: WorkspaceState;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-5 py-8 text-[var(--ink)]">
      <section className="login-panel">
        <div className="flex items-center gap-3">
          <div className="brand-mark">BB</div>
          <div>
            <p className="eyebrow">BoekBalans</p>
            <h1>{state === "setup" ? "Werkruimte instellen" : "Werkruimte ontgrendelen"}</h1>
          </div>
        </div>

        {state === "checking" && (
          <p className="mt-6 text-sm leading-6 text-[var(--muted)]">
            Werkruimte controleren...
          </p>
        )}

        {state === "setup" && (
          <form className="mt-6 grid gap-4" onSubmit={onSetup}>
            <Field label="Naam werkruimte">
              <input
                className="input"
                onChange={(event) =>
                  setSetupForm({ ...setupForm, workspaceName: event.target.value })
                }
                value={setupForm.workspaceName}
              />
            </Field>
            <Field label="E-mail">
              <input
                className="input"
                onChange={(event) =>
                  setSetupForm({ ...setupForm, email: event.target.value })
                }
                type="email"
                value={setupForm.email}
              />
            </Field>
            <Field label="Pincode">
              <input
                className="input"
                inputMode="numeric"
                maxLength={12}
                minLength={4}
                onChange={(event) =>
                  setSetupForm({ ...setupForm, pin: event.target.value })
                }
                type="password"
                value={setupForm.pin}
              />
            </Field>
            <p className="text-sm leading-6 text-[var(--muted)]">
              De huidige administraties worden opgeslagen in een lokaal databestand op deze computer.
            </p>
            <button className="primary-button justify-center py-3">
              Werkruimte aanmaken
            </button>
          </form>
        )}

        {state === "locked" && (
          <form className="mt-6 grid gap-4" onSubmit={onLogin}>
            <div className="notice">
              <p className="text-sm font-semibold">{profile?.workspaceName ?? "BoekBalans"}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Vul je pincode in om de serveropslag te openen.
              </p>
            </div>
            <Field label="Pincode">
              <input
                autoFocus
                className="input"
                inputMode="numeric"
                maxLength={12}
                onChange={(event) => setPin(event.target.value)}
                type="password"
                value={pin}
              />
            </Field>
            <button className="primary-button justify-center py-3">
              Ontgrendel
            </button>
          </form>
        )}

        {error ? <p className="mt-4 rounded-lg bg-[var(--coral-soft)] p-3 text-sm text-[var(--ink)]">{error}</p> : null}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
      {label}
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  accent = "teal",
}: {
  label: string;
  value: string;
  accent?: "teal" | "blue" | "coral" | "yellow";
}) {
  return (
    <div className={`metric-card accent-${accent}`}>
      <p className="text-xs font-bold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Notice({ label, text }: { label: string; text: string }) {
  return (
    <div className="notice">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{text}</p>
    </div>
  );
}

function DownloadCard({
  title,
  text,
  button,
  onClick,
}: {
  title: string;
  text: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">Download</p>
      <h3>{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{text}</p>
      <button className="primary-button mt-5 w-full justify-center" onClick={onClick}>
        {button}
      </button>
    </section>
  );
}

function CheckRows({
  children,
  emptyText,
}: {
  children: ReactNode;
  emptyText: string;
}) {
  const items = Children.toArray(children).filter(Boolean);
  const isEmpty = items.length === 0;

  if (isEmpty) {
    return <p className="mt-4 rounded-lg bg-white p-4 text-sm text-[var(--muted)]">{emptyText}</p>;
  }

  return <div className="mt-4 grid gap-2">{items}</div>;
}

function CheckRow({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children?: ReactNode;
}) {
  return (
    <div className="check-row">
      <div>
        <strong>{title}</strong>
        <p>{meta}</p>
      </div>
      {children ? <div className="check-action">{children}</div> : null}
    </div>
  );
}

function ProfitLossPanel({
  periodLabel,
  statement,
}: {
  periodLabel: string;
  statement: ProfitLossStatement;
}) {
  return (
    <section className="panel xl:col-span-3">
      <div className="section-title">
        <div>
          <p className="eyebrow">Rapportage · {periodLabel}</p>
          <h3>Winst- en verliesrekening</h3>
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr_0.85fr]">
        <div className="statement-block">
          <p className="text-xs font-bold uppercase text-[var(--teal)]">Opbrengsten</p>
          <StatementRows emptyText="Nog geen opbrengsten.">
            {statement.revenueLines.map((line) => (
              <StatementRow key={line.label} label={line.label} value={money.format(line.amount)} />
            ))}
          </StatementRows>
          <StatementTotal label="Totaal opbrengsten" value={money.format(statement.revenueTotal)} />
        </div>
        <div className="statement-block">
          <p className="text-xs font-bold uppercase text-[var(--coral)]">Kosten</p>
          <StatementRows emptyText="Nog geen kosten.">
            {statement.expenseLines.map((line) => (
              <StatementRow key={line.label} label={line.label} value={money.format(line.amount)} />
            ))}
          </StatementRows>
          <StatementRow label="Afschrijvingen" value={money.format(statement.depreciation)} />
          <StatementTotal
            label="Totaal kosten"
            value={money.format(statement.expenseTotal + statement.depreciation)}
          />
        </div>
        <div className="statement-result">
          <p className="text-xs font-bold uppercase text-[var(--muted)]">Resultaat</p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="summary-line">
              <dt>Voor afschrijving</dt>
              <dd>{money.format(statement.profitBeforeDepreciation)}</dd>
            </div>
            <div className="summary-line">
              <dt>Na afschrijving</dt>
              <dd className={statement.profitAfterDepreciation >= 0 ? "amount-positive" : "amount-negative"}>
                {money.format(statement.profitAfterDepreciation)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

function StatementRows({
  children,
  emptyText,
}: {
  children: ReactNode;
  emptyText: string;
}) {
  const items = Children.toArray(children).filter(Boolean);
  if (!items.length) {
    return <p className="mt-4 text-sm text-[var(--muted)]">{emptyText}</p>;
  }

  return <dl className="mt-4 grid gap-2 text-sm">{items}</dl>;
}

function StatementRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="statement-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatementTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="statement-total">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QuarterOverview({
  quarters,
}: {
  quarters: Array<{ quarter: 1 | 2 | 3 | 4; entries: Entry[]; summary: Summary }>;
}) {
  return (
    <section className="panel xl:col-span-3">
      <div className="section-title">
        <div>
          <p className="eyebrow">Boekjaar per kwartaal</p>
          <h3>Kwartaaloverzicht</h3>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {quarters.map(({ quarter, entries, summary }) => {
          const profit = summary.revenue - summary.costs;
          const vatBalance = summary.vatToPay - summary.vatToClaim;

          return (
            <div className="quarter-card" key={quarter}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Kwartaal {quarter}</p>
                  <h4>{entries.length} boekingen</h4>
                </div>
                <span className="status-pill">{vatBalance >= 0 ? "Te betalen" : "Terug"}</span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="summary-line">
                  <dt>Omzet</dt>
                  <dd>{money.format(summary.revenue)}</dd>
                </div>
                <div className="summary-line">
                  <dt>Kosten</dt>
                  <dd>{money.format(summary.costs)}</dd>
                </div>
                <div className="summary-line">
                  <dt>Resultaat</dt>
                  <dd>{money.format(profit)}</dd>
                </div>
                <div className="summary-line">
                  <dt>Btw saldo</dt>
                  <dd>{money.format(Math.abs(vatBalance))}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Bar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const height = `${Math.max((value / max) * 100, value > 0 ? 8 : 2)}%`;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
      <div className="flex min-h-0 items-end">
        <div
          className="w-full rounded-t-md"
          style={{ height, backgroundColor: color }}
          title={`${label}: ${money.format(value)}`}
        />
      </div>
      <div className="text-center text-xs font-semibold text-[var(--muted)]">{label}</div>
    </div>
  );
}

function CompactEntries({ entries }: { entries: Entry[] }) {
  if (!entries.length) {
    return <p className="mt-4 text-sm text-[var(--muted)]">Nog geen boekingen.</p>;
  }

  return (
    <div className="mt-4 grid gap-2">
      {entries.map((entry) => (
        <div className="compact-row" key={entry.id}>
          <div>
            <strong className="block">{entry.description}</strong>
            <span className="text-xs text-[var(--muted)]">{entry.date} · {entry.relation}</span>
          </div>
          <span className={entry.type === "income" ? "amount-positive" : "amount-negative"}>
            {entry.type === "income" ? "+" : "-"} {money.format(entry.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EntryTable({
  entries,
  onEdit,
  onRemove,
  onDownload,
  periodLabel,
}: {
  entries: Entry[];
  onEdit: (entry: Entry) => void;
  onRemove: (entryId: string) => void;
  onDownload: () => void;
  periodLabel: string;
}) {
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">{entries.length} regels</p>
          <h3>Boekingen</h3>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{periodLabel}</p>
        </div>
        <button className="secondary-button" onClick={onDownload}>
          Download
        </button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs font-bold uppercase text-[var(--muted)]">
              <th className="py-3 pr-3">Datum</th>
              <th className="py-3 pr-3">Omschrijving</th>
              <th className="py-3 pr-3">Soort</th>
              <th className="py-3 pr-3">Categorie</th>
              <th className="py-3 pr-3">Excl. btw</th>
              <th className="py-3 pr-3">Afschrijving</th>
              <th className="py-3 pr-3">Status</th>
              <th className="py-3 pr-3">Actie</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr className="border-b border-[var(--line)] last:border-b-0" key={entry.id}>
                <td className="py-3 pr-3">{entry.date}</td>
                <td className="py-3 pr-3">
                  <strong className="block">{entry.description}</strong>
                  <span className="text-xs text-[var(--muted)]">{entry.relation}</span>
                </td>
                <td className="py-3 pr-3">{entry.type === "income" ? "Inkomsten" : "Uitgaven"}</td>
                <td className="py-3 pr-3">{entry.category}</td>
                <td className="py-3 pr-3">{money.format(entry.amount)}</td>
                <td className="py-3 pr-3">
                  {entry.depreciationYears
                    ? `${entry.depreciationYears} jaar · ${money.format(entry.amount / entry.depreciationYears)} p.j.`
                    : "-"}
                </td>
                <td className="py-3 pr-3">{entry.status === "paid" ? "Betaald" : "Open"}</td>
                <td className="py-3 pr-3">
                  <div className="flex gap-2">
                    <button className="ghost-button" onClick={() => onEdit(entry)}>
                      Bewerk
                    </button>
                    <button className="ghost-button" onClick={() => onRemove(entry.id)}>
                      Verwijder
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <p className="py-6 text-sm text-[var(--muted)]">Nog geen boekingen.</p>}
      </div>
    </section>
  );
}

function InvoiceImportPanel({
  bookableCount,
  contacts,
  drafts,
  importStatus,
  onBookSelected,
  onClear,
  onImport,
  onRemove,
  onUpdate,
  selectedCount,
}: {
  bookableCount: number;
  contacts: Contact[];
  drafts: InvoiceDraft[];
  importStatus: string;
  onBookSelected: () => void;
  onClear: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (draftId: string) => void;
  onUpdate: (draftId: string, field: keyof InvoiceDraft, value: string | boolean) => void;
  selectedCount: number;
}) {
  const relationListId = "invoice-relations";

  return (
    <div className="mt-6 grid gap-5">
      <section className="panel invoice-upload-panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">Facturen verwerken</p>
            <h3>Meerdere facturen uploaden</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Upload verkoopfacturen, inkoopfacturen, bonnen of UBL-bestanden. BoekBalans maakt
              conceptboekingen die je eerst controleert.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="primary-button">
              Kies bestanden
              <input
                className="sr-only"
                multiple
                onChange={onImport}
                type="file"
                accept="application/pdf,image/*,.xml,.ubl,.csv,.txt"
              />
            </label>
            <button className="secondary-button" onClick={onBookSelected} type="button">
              Boek selectie
            </button>
            {drafts.length ? (
              <button className="ghost-button" onClick={onClear} type="button">
                Leeg lijst
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Conceptfacturen" value={String(drafts.length)} accent="teal" />
          <Metric label="Geselecteerd" value={String(selectedCount)} accent="blue" />
          <Metric label="Boekbaar" value={String(bookableCount)} accent="yellow" />
        </div>

        <div className="mt-4 rounded-lg border border-[var(--line)] bg-white p-4">
          <p className="text-sm font-semibold">Slim inlezen</p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Met een OpenAI API-sleutel herkent BoekBalans PDF&apos;s, afbeeldingen en UBL/XML-facturen
            automatisch. Zonder sleutel maakt de app een lokaal voorstel op basis van bestandsnaam en
            leesbare tekst.
          </p>
          {importStatus ? (
            <p className="mt-2 text-sm font-semibold text-[var(--teal)]">{importStatus}</p>
          ) : null}
        </div>
      </section>

      <datalist id={relationListId}>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.name}>
            {contact.type === "customer" ? "Klant" : contact.type === "supplier" ? "Leverancier" : "Ondernemer"}
            {contact.kvk ? ` · KvK ${contact.kvk}` : ""}
          </option>
        ))}
      </datalist>

      <section className="grid gap-4">
        {drafts.map((draft) => {
          const amount = Number(draft.amount.toString().replace(",", "."));
          const isBookable = draft.description.trim() && Number.isFinite(amount) && amount > 0;

          return (
            <article className="invoice-draft-card" key={draft.id}>
              <div className="invoice-draft-header">
                <label className="toggle-line compact-toggle">
                  <input
                    checked={draft.selected}
                    onChange={(event) => onUpdate(draft.id, "selected", event.target.checked)}
                    type="checkbox"
                  />
                  <span>Meenemen</span>
                </label>
                <div className="min-w-0">
                  <h4>{draft.fileName}</h4>
                  <p>
                    {draft.source} · zekerheid {draft.confidence}% · {(draft.fileSize / 1024).toFixed(0)} KB
                  </p>
                </div>
                <span className={`status-pill ${isBookable ? "" : "warning-pill"}`}>
                  {isBookable ? "Boekbaar" : "Aanvullen"}
                </span>
              </div>

              <div className="invoice-form-grid">
                <Field label="Soort">
                  <select
                    className="input"
                    value={draft.type}
                    onChange={(event) => onUpdate(draft.id, "type", event.target.value as EntryType)}
                  >
                    <option value="income">Verkoopfactuur</option>
                    <option value="expense">Inkoopfactuur</option>
                  </select>
                </Field>
                <Field label="Datum">
                  <input
                    className="input"
                    type="date"
                    value={draft.date}
                    onChange={(event) => onUpdate(draft.id, "date", event.target.value)}
                  />
                </Field>
                <Field label="Factuurnummer">
                  <input
                    className="input"
                    value={draft.invoiceNumber}
                    onChange={(event) => onUpdate(draft.id, "invoiceNumber", event.target.value)}
                  />
                </Field>
                <Field label="Relatie">
                  <input
                    className="input"
                    list={relationListId}
                    placeholder="Kies of typ een relatie"
                    value={draft.relation}
                    onChange={(event) => onUpdate(draft.id, "relation", event.target.value)}
                  />
                </Field>
                <Field label="Omschrijving">
                  <input
                    className="input"
                    value={draft.description}
                    onChange={(event) => onUpdate(draft.id, "description", event.target.value)}
                  />
                </Field>
                <Field label="Categorie">
                  <select
                    className="input"
                    value={draft.category}
                    onChange={(event) => onUpdate(draft.id, "category", event.target.value)}
                  >
                    {entryCategories[draft.type].map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Bedrag excl. btw">
                  <input
                    className="input"
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(event) => onUpdate(draft.id, "amount", event.target.value)}
                  />
                </Field>
                <Field label="Btw">
                  <select
                    className="input"
                    value={draft.vatRate}
                    onChange={(event) => onUpdate(draft.id, "vatRate", event.target.value)}
                  >
                    <option value="21">21%</option>
                    <option value="9">9%</option>
                    <option value="0">0%</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    className="input"
                    value={draft.status}
                    onChange={(event) => onUpdate(draft.id, "status", event.target.value as EntryStatus)}
                  >
                    <option value="paid">Betaald</option>
                    <option value="open">Open</option>
                  </select>
                </Field>
              </div>

              <div className="invoice-draft-footer">
                <p>{draft.note}</p>
                <button className="ghost-button" onClick={() => onRemove(draft.id)} type="button">
                  Verwijder
                </button>
              </div>
            </article>
          );
        })}

        {!drafts.length ? (
          <section className="panel">
            <p className="text-sm text-[var(--muted)]">
              Nog geen facturen geupload. Kies meerdere bestanden om een werkvoorraad met
              conceptboekingen te maken.
            </p>
          </section>
        ) : null}
      </section>
    </div>
  );
}
