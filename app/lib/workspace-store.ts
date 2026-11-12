import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type WorkspaceData = {
  profile: unknown;
  administrations: unknown[];
  updatedAt: string;
  revision?: string;
};
type Result = { meta: { changes: number } };
type Statement = {
  bind: (...values: unknown[]) => Statement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<Result>;
};
export type WorkspaceDatabase = {
  prepare: (sql: string) => Statement;
  batch: (statements: Statement[]) => Promise<Result[]>;
};
export type WorkspaceHistory = { revision: string; savedAt: string };
export const historyLimit = 200;
const tokenSql = "COALESCE(json_extract(data, '$.revision'), json_extract(data, '$.updatedAt'))";
export const workspaceRevision = (store: WorkspaceData) => store.revision ?? store.updatedAt;
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

export async function ensureWorkspaceSchema(db: WorkspaceDatabase) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS workspace_store (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS workspace_history (revision TEXT PRIMARY KEY, administrations TEXT NOT NULL, saved_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS workspace_history_time ON workspace_history(saved_at DESC)"),
  ]);
}

export async function readWorkspace<T extends WorkspaceData>(db: WorkspaceDatabase | null, directory: string): Promise<T | null> {
  if (db) {
    await ensureWorkspaceSchema(db);
    const row = await db.prepare("SELECT data FROM workspace_store WHERE id = ?").bind("main").first<{ data: string }>();
    return row ? JSON.parse(row.data) as T : null;
  }
  try { return JSON.parse(await readFile(join(directory, "boekbalans-workspace.json"), "utf8")) as T; }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

// Local development also serializes the compare-and-write and uses atomic rename.
let localWrite: Promise<unknown> = Promise.resolve();
export async function writeWorkspace<T extends WorkspaceData>(db: WorkspaceDatabase | null, directory: string, store: T, expectedRevision: string | null) {
  if (db) {
    await ensureWorkspaceSchema(db);
    if (expectedRevision === null) {
      const result = await db.prepare("INSERT OR IGNORE INTO workspace_store (id, data, updated_at) VALUES (?, ?, ?)")
        .bind("main", JSON.stringify(store), store.updatedAt).run();
      return result.meta.changes === 1;
    }
    // The previous version and the conditional replacement commit together.
    // A stale browser can neither replace data nor create a false history entry.
    const results = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO workspace_history (revision, administrations, saved_at)
        SELECT ${tokenSql}, json_extract(data, '$.administrations'), updated_at
        FROM workspace_store WHERE id = ? AND ${tokenSql} = ?`).bind("main", expectedRevision),
      db.prepare(`UPDATE workspace_store SET data = ?, updated_at = ? WHERE id = ? AND ${tokenSql} = ?`)
        .bind(JSON.stringify(store), store.updatedAt, "main", expectedRevision),
      db.prepare(`DELETE FROM workspace_history WHERE revision NOT IN
        (SELECT revision FROM workspace_history ORDER BY saved_at DESC, rowid DESC LIMIT ?)`)
        .bind(historyLimit),
    ]);
    return results[1].meta.changes === 1;
  }
  const write = localWrite.then(async () => {
    const current = await readWorkspace(db, directory);
    if (expectedRevision === null ? current !== null : !current || workspaceRevision(current) !== expectedRevision) return false;
    await mkdir(directory, { recursive: true });
    if (current) {
      const historyDirectory = join(directory, "workspace-history");
      await mkdir(historyDirectory, { recursive: true });
      await writeFile(join(historyDirectory, `${encodeURIComponent(workspaceRevision(current))}.json`), JSON.stringify({
        revision: workspaceRevision(current), savedAt: current.updatedAt, administrations: current.administrations,
      }), "utf8");
      const history = await listWorkspaceHistory(null, directory);
      await Promise.all(history.slice(historyLimit).map((item) => unlink(join(historyDirectory, `${encodeURIComponent(item.revision)}.json`))));
    }
    const temp = join(directory, `workspace-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(store), "utf8");
    await rename(temp, join(directory, "boekbalans-workspace.json"));
    return true;
  });
  localWrite = write.catch(() => undefined);
  return write;
}

export async function listWorkspaceHistory(db: WorkspaceDatabase | null, directory: string): Promise<WorkspaceHistory[]> {
  if (db) {
    await ensureWorkspaceSchema(db);
    return (await db.prepare("SELECT revision, saved_at AS savedAt FROM workspace_history ORDER BY saved_at DESC, rowid DESC LIMIT ?")
      .bind(historyLimit).all<WorkspaceHistory>()).results;
  }
  try {
    const files = await readdir(join(directory, "workspace-history"));
    const items = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
      const item = JSON.parse(await readFile(join(directory, "workspace-history", file), "utf8"));
      return { revision: item.revision as string, savedAt: item.savedAt as string };
    }));
    return items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch (error) { if (isMissing(error)) return []; throw error; }
}

export async function readWorkspaceHistory(db: WorkspaceDatabase | null, directory: string, revision: string): Promise<unknown[] | null> {
  if (db) {
    const row = await db.prepare("SELECT administrations FROM workspace_history WHERE revision = ?").bind(revision).first<{ administrations: string }>();
    return row ? JSON.parse(row.administrations) : null;
  }
  try {
    return JSON.parse(await readFile(join(directory, "workspace-history", `${encodeURIComponent(revision)}.json`), "utf8")).administrations;
  } catch (error) { if (isMissing(error)) return null; throw error; }
}
