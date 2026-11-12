import type { EmployeeSalary, EmployeeDraft } from "../../lib/employee-payroll";
import type { AccountingEntryFields, PayrollDeclaration, WkrSettings } from "../../lib/payroll-accounting";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { readWorkspace, writeWorkspace, workspaceRevision, listWorkspaceHistory, readWorkspaceHistory, type WorkspaceDatabase } from "../../lib/workspace-store";

type Entry = AccountingEntryFields & {
  id: string;
  date: string;
  vatDate?: string;
  invoiceNumber?: string;
  description: string;
  relation: string;
  category: string;
  type: "income" | "expense";
  amount: number;
  vatRate: number;
  status: "paid" | "open";
  paidDate?: string;
  depreciationYears?: 5 | 10;
};

type Contact = {
  kind?: "business" | "private";
  id: string;
  name: string;
  email: string;
  address?: string;
  kvk?: string;
  type: "customer" | "supplier" | "entrepreneur";
};

type SalaryRecord = EmployeeSalary;

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

type Administration = {
  id: string;
  name: string;
  owner: string;
  kvk: string;
  vatNumber: string;
  wageTaxNumber?: string;
  fiscalYear: number;
  payrollDeclarations?: PayrollDeclaration[];
  wkrSettingsByYear?: Record<string, WkrSettings>;
  nextInvoiceNumber?: string;
  autoInvoiceNumbering?: boolean;
  iban: string;
  entries: Entry[];
  contacts: Contact[];
  payrollEmployees?: PayrollEmployee[];
  employeePayrollDrafts?: EmployeeDraft[];
  salaries?: SalaryRecord[];
  vatDeduction?: VatDeductionSettings;
};

type WorkspaceStore = {
  revision?: string;
  profile: {
    workspaceName: string;
    email: string;
    pinHash: string;
    createdAt: string;
  };
  administrations: Administration[];
  updatedAt: string;
};

type WorkspaceRequest =
  | {
      action: "setup";
      workspaceName: string;
      email: string;
      pin: string;
      administrations: Administration[];
    }
  | { action: "login"; pin: string }
  | { action: "save"; pin: string; administrations: Administration[]; revision?: string }
  | { action: "history"; pin: string }
  | { action: "snapshot"; pin: string; revision: string; administrationId: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataDirectory = join(process.cwd(), "data");

function hashPin(pin: string) {
  return createHash("sha256").update(pin).digest("hex");
}

function publicProfile(store: WorkspaceStore) {
  return {
    workspaceName: store.profile.workspaceName,
    email: store.profile.email,
    createdAt: store.profile.createdAt,
    updatedAt: store.updatedAt,
  };
}

function getD1Database(): WorkspaceDatabase | null {
  try {
    const db = (getCloudflareContext().env as { DB?: WorkspaceDatabase }).DB;
    if (db) return db;
  } catch { /* Local development has no Cloudflare context. */ }
  if (process.env.NODE_ENV === "production") throw new Error("De serveropslag is niet bereikbaar. Je invoer is nog niet opgeslagen.");
  return null;
}

async function readStore() {
  return readWorkspace<WorkspaceStore>(getD1Database(), dataDirectory);
}

function isValidPin(pin: string) {
  return /^\d{4,12}$/.test(pin);
}

function isValidAdministration(value: unknown): value is Administration {
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

function isValidAdministrationList(value: unknown): value is Administration[] {
  return Array.isArray(value) && value.length > 0 && value.every(isValidAdministration)
    && new Set(value.map((item) => item.id)).size === value.length;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    const store = await readStore();
    if (!store) return json({ configured: false });
    return json({ configured: true, profile: publicProfile(store) });
  } catch {
    return json({ error: "Serveropslag is niet bereikbaar." }, 503);
  }
}

async function handlePost(request: NextRequest) {
  const body = (await request.json()) as WorkspaceRequest;
  const store = await readStore();

  if (body.action === "setup") {
    if (store) return json({ error: "Werkruimte bestaat al." }, 409);
    if (!body.workspaceName.trim()) return json({ error: "Naam ontbreekt." }, 400);
    if (!isValidPin(body.pin)) return json({ error: "Gebruik een pincode van 4 tot 12 cijfers." }, 400);
    if (!isValidAdministrationList(body.administrations)) {
      return json({ error: "Administraties zijn niet geldig." }, 400);
    }

    const nextStore: WorkspaceStore = {
      revision: randomUUID(),
      profile: {
        workspaceName: body.workspaceName.trim(),
        email: body.email.trim(),
        pinHash: hashPin(body.pin),
        createdAt: new Date().toISOString(),
      },
      administrations: body.administrations,
      updatedAt: new Date().toISOString(),
    };

    if (!await writeWorkspace(getD1Database(), dataDirectory, nextStore, null)) return json({ error: "Werkruimte bestaat al." }, 409);
    return json({
      configured: true,
      revision: workspaceRevision(nextStore),
      profile: publicProfile(nextStore),
      administrations: nextStore.administrations,
    });
  }

  if (!store) return json({ error: "Werkruimte is nog niet ingesteld." }, 404);
  if (hashPin(body.pin) !== store.profile.pinHash) {
    return json({ error: "Pincode klopt niet." }, 401);
  }

  if (body.action === "login") {
    return json({
      configured: true,
      revision: workspaceRevision(store),
      profile: publicProfile(store),
      administrations: store.administrations,
    });
  }

  if (body.action === "history") {
    return json({ history: await listWorkspaceHistory(getD1Database(), dataDirectory) });
  }

  if (body.action === "snapshot") {
    if (typeof body.revision !== "string" || typeof body.administrationId !== "string") return json({ error: "Herstelkopie is niet geldig." }, 400);
    const snapshot = await readWorkspaceHistory(getD1Database(), dataDirectory, body.revision) as Administration[] | null;
    const administration = snapshot?.find((item) => item.id === body.administrationId);
    if (!administration) return json({ error: "Deze administratie staat niet in deze herstelkopie." }, 404);
    return json({ administration });
  }

  if (body.action === "save") {
    if (typeof body.revision !== "string" || !body.revision) {
      return json({ error: "Deze versie van BoekBalans kan niet veilig opslaan. Download je invoer als backup en open BoekBalans opnieuw.", code: "UPDATE_REQUIRED" }, 428);
    }
    if (body.revision !== workspaceRevision(store)) {
      return json({ error: "Een andere sessie heeft nieuwere gegevens opgeslagen. Je invoer is behouden; download je invoer voordat je de nieuwste serverversie opent.", code: "REVISION_CONFLICT" }, 409);
    }
    if (!isValidAdministrationList(body.administrations)) {
      return json({ error: "Administraties zijn niet geldig." }, 400);
    }

    const nextStore = {
      ...store,
      revision: randomUUID(),
      administrations: body.administrations,
      updatedAt: new Date().toISOString(),
    };

    if (!await writeWorkspace(getD1Database(), dataDirectory, nextStore, body.revision)) {
      return json({ error: "Een andere sessie heeft nieuwere gegevens opgeslagen. Je invoer is behouden; download je invoer voordat je de nieuwste serverversie opent.", code: "REVISION_CONFLICT" }, 409);
    }
    return json({ ok: true, revision: workspaceRevision(nextStore), profile: publicProfile(nextStore) });
  }

  return json({ error: "Onbekende actie." }, 400);
}

export async function POST(request: NextRequest) {
  try { return await handlePost(request); }
  catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Verzoek is niet geldig." }, 400);
    console.error("Workspace request failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Serveropslag is niet gelukt. Bewaar je invoer als backup en probeer opnieuw." }, 503);
  }
}
