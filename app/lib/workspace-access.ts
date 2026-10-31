import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
export type DatabaseStatement = { bind: (...values: unknown[]) => DatabaseStatement; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> };
export type DocumentDatabase = { prepare: (query: string) => DatabaseStatement; batch: (statements: DatabaseStatement[]) => Promise<unknown> };
export type AccessStore = { profile: { pinHash: string }; administrations: Array<{ id: string }> };
export function getDocumentDatabase(): DocumentDatabase | null {
  try { const db = (getCloudflareContext().env as { DB?: DocumentDatabase }).DB; if (db) return db; } catch { /* Local development has no Cloudflare context. */ }
  if (process.env.NODE_ENV === "production") throw new Error("De online documentopslag is niet beschikbaar. Probeer later opnieuw.");
  return null;
}
export function hasAdministrationAccess(store: AccessStore | null, pin: unknown, administrationId: unknown) {
  if (!store || typeof pin !== "string" || !/^\d{4,12}$/.test(pin) || typeof administrationId !== "string") return false;
  const expected = Buffer.from(store.profile.pinHash, "hex");
  const actual = createHash("sha256").update(pin).digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual) && store.administrations.some((admin) => admin.id === administrationId);
}
export async function authorizeDocumentAccess(db: DocumentDatabase | null, pin: unknown, administrationId: unknown) {
  let store: AccessStore | null = null;
  if (db) {
    const row = await db.prepare("SELECT data FROM workspace_store WHERE id = ?").bind("main").first<{ data: string }>();
    store = row ? JSON.parse(row.data) : null;
  } else {
    try { store = JSON.parse(await readFile(join(process.cwd(), "data", "boekbalans-workspace.json"), "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return hasAdministrationAccess(store, pin, administrationId);
}
