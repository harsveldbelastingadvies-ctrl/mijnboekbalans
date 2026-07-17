import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

type Entry = {
  id: string;
  date: string;
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
  id: string;
  name: string;
  email: string;
  address?: string;
  kvk?: string;
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
  status: "paid" | "open";
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

type D1Statement<T = unknown> = {
  bind: (...values: unknown[]) => D1Statement<T>;
  first: <Row = T>() => Promise<Row | null>;
  run: () => Promise<unknown>;
};

type D1Database = {
  prepare: <T = unknown>(query: string) => D1Statement<T>;
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

type WorkspaceStore = {
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
  | { action: "save"; pin: string; administrations: Administration[] };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataDirectory = join(process.cwd(), "data");
const storePath = join(dataDirectory, "boekbalans-workspace.json");
const workspaceId = "main";

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

async function readStore() {
  const db = getD1Database();
  if (db) return readD1Store(db);

  try {
    const contents = await readFile(storePath, "utf8");
    return JSON.parse(contents) as WorkspaceStore;
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function writeStore(store: WorkspaceStore) {
  const db = getD1Database();
  if (db) {
    await writeD1Store(db, store);
    return;
  }

  await mkdir(dataDirectory, { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

function getD1Database() {
  try {
    const context = getCloudflareContext();
    return (context.env as { DB?: D1Database }).DB ?? null;
  } catch {
    return null;
  }
}

async function ensureD1Schema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS workspace_store (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run();
}

async function readD1Store(db: D1Database) {
  await ensureD1Schema(db);
  const row = await db
    .prepare<{ data: string }>("SELECT data FROM workspace_store WHERE id = ?")
    .bind(workspaceId)
    .first<{ data: string }>();

  return row ? (JSON.parse(row.data) as WorkspaceStore) : null;
}

async function writeD1Store(db: D1Database, store: WorkspaceStore) {
  await ensureD1Schema(db);
  await db
    .prepare(
      `INSERT INTO workspace_store (id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at`,
    )
    .bind(workspaceId, JSON.stringify(store), store.updatedAt)
    .run();
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
  return Array.isArray(value) && value.every(isValidAdministration);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET() {
  const store = await readStore();

  if (!store) {
    return json({ configured: false });
  }

  return json({ configured: true, profile: publicProfile(store) });
}

export async function POST(request: NextRequest) {
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
      profile: {
        workspaceName: body.workspaceName.trim(),
        email: body.email.trim(),
        pinHash: hashPin(body.pin),
        createdAt: new Date().toISOString(),
      },
      administrations: body.administrations,
      updatedAt: new Date().toISOString(),
    };

    await writeStore(nextStore);
    return json({
      configured: true,
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
      profile: publicProfile(store),
      administrations: store.administrations,
    });
  }

  if (body.action === "save") {
    if (!isValidAdministrationList(body.administrations)) {
      return json({ error: "Administraties zijn niet geldig." }, 400);
    }

    const nextStore = {
      ...store,
      administrations: body.administrations,
      updatedAt: new Date().toISOString(),
    };

    await writeStore(nextStore);
    return json({ ok: true, profile: publicProfile(nextStore) });
  }

  return json({ error: "Onbekende actie." }, 400);
}
