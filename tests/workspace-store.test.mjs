import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as storeFunctions from "../app/lib/workspace-store.ts";
import { readWorkspace, writeWorkspace, listWorkspaceHistory, readWorkspaceHistory, workspaceRevision, historyLimit } from "../app/lib/workspace-store.ts";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  const prepare = (sql, values = []) => ({ sql, values,
    bind: (...next) => prepare(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  });
  return { sqlite, prepare, batch: async (statements) => {
    sqlite.exec("BEGIN");
    try {
      const rows = statements.map((s) => ({ meta: { changes: Number(sqlite.prepare(s.sql).run(...s.values).changes) } }));
      sqlite.exec("COMMIT"); return rows;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
}
const initial = () => ({ profile: { pinHash: "must-not-appear-in-history" }, updatedAt: "2026-11-12T10:00:00.000Z", administrations: [
  { id: "edego", entries: [{ id: "old", invoiceNumber: "2024-0045" }], contacts: [] },
  { id: "other", entries: [{ id: "other-entry" }], contacts: [] },
] });
const next = (store, revision, invoice = "2024-0046") => ({ ...store, revision, updatedAt: "2026-11-12T10:01:00.000Z", administrations: store.administrations.map((a) => a.id === "edego" ? { ...a, entries: [...a.entries, { id: revision, invoiceNumber: invoice }] } : a) });

test("two sessions based on the same old version: only one can replace the workspace", async () => {
  const db = database(), old = initial();
  assert.equal(await writeWorkspace(db, "unused", old, null), true);
  const revision = workspaceRevision(await readWorkspace(db, "unused"));
  const a = next(old, "session-a"), b = next(old, "session-b", "2024-0085");
  const results = await Promise.all([writeWorkspace(db, "unused", a, revision), writeWorkspace(db, "unused", b, revision)]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.deepEqual(await readWorkspace(db, "unused"), a);
  assert.deepEqual((await readWorkspace(db, "unused")).administrations[1], old.administrations[1]);
  assert.deepEqual(await readWorkspaceHistory(db, "unused", revision), old.administrations);
  assert.equal((await listWorkspaceHistory(db, "unused")).length, 1);
  assert.equal(JSON.stringify(db.sqlite.prepare("SELECT * FROM workspace_history").all()).includes("must-not-appear"), false);
});

test("a failed archive rolls back the replacement, and a failed replacement rolls back its archive", async () => {
  const db = database(), old = initial(); await writeWorkspace(db, "unused", old, null);
  const revision = workspaceRevision(old);
  db.sqlite.exec("CREATE TRIGGER fail_archive BEFORE INSERT ON workspace_history BEGIN SELECT RAISE(ABORT, 'archive unavailable'); END");
  await assert.rejects(() => writeWorkspace(db, "unused", next(old, "new"), revision), /archive unavailable/);
  assert.deepEqual(await readWorkspace(db, "unused"), old);
  db.sqlite.exec("DROP TRIGGER fail_archive; CREATE TRIGGER fail_update BEFORE UPDATE ON workspace_store BEGIN SELECT RAISE(ABORT, 'update unavailable'); END");
  await assert.rejects(() => writeWorkspace(db, "unused", next(old, "new"), revision), /update unavailable/);
  assert.deepEqual(await readWorkspace(db, "unused"), old);
  assert.equal((await listWorkspaceHistory(db, "unused")).length, 0);
});

test("setup cannot replace an existing workspace; a client without a revision cannot save", async () => {
  const db = database(), old = initial(); await writeWorkspace(db, "unused", old, null);
  assert.equal(await writeWorkspace(db, "unused", next(old, "new"), null), false);
  assert.equal(await writeWorkspace(db, "unused", next(old, "new"), ""), false);
  assert.deepEqual(await readWorkspace(db, "unused"), old);
});

test("the 200 most recent full versions remain downloadable and the current one stays intact", async () => {
  const db = database(); let store = initial(); await writeWorkspace(db, "unused", store, null);
  for (let i = 1; i <= historyLimit + 3; i++) {
    const updated = next(store, `revision-${i}`);
    updated.updatedAt = new Date(Date.UTC(2026, 10, 12, 10, i)).toISOString();
    assert.equal(await writeWorkspace(db, "unused", updated, workspaceRevision(store)), true); store = updated;
  }
  const history = await listWorkspaceHistory(db, "unused");
  assert.equal(history.length, historyLimit);
  assert.equal(history[0].revision, `revision-${historyLimit + 2}`);
  assert.equal(await readWorkspaceHistory(db, "unused", workspaceRevision(initial())), null);
  assert.deepEqual(await readWorkspace(db, "unused"), store);
});

test("local storage writes atomically, checks revisions, and keeps the previous administration only", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boekbalans-store-"));
  try {
    const old = initial(); await writeWorkspace(null, directory, old, null);
    const updated = next(old, "revision-new");
    assert.deepEqual(await Promise.all([writeWorkspace(null, directory, updated, workspaceRevision(old)), writeWorkspace(null, directory, next(old, "stale"), workspaceRevision(old))]), [true, false]);
    assert.deepEqual(await readWorkspace(null, directory), updated);
    assert.deepEqual(await readWorkspaceHistory(null, directory, workspaceRevision(old)), old.administrations);
    const archive = await readFile(join(directory, "workspace-history", `${encodeURIComponent(workspaceRevision(old))}.json`), "utf8");
    assert.equal(archive.includes("pinHash"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

async function workspaceApi(db) {
  const source = await readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} }, nativeRequire = createRequire(import.meta.url);
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports,
    process: { cwd: () => "unused", env: { NODE_ENV: "production" } },
    console: { error: () => {} },
    require: (name) => {
      if (name === "next/server") return { NextResponse: { json: (data, init) => new Response(JSON.stringify(data), init) } };
      if (name === "@opennextjs/cloudflare") return { getCloudflareContext: () => ({ env: { DB: db } }) };
      if (name.includes("workspace-store")) return storeFunctions;
      return nativeRequire(name);
    },
  });
  return { ...compiledModule.exports, post: async (data) => {
    const response = await compiledModule.exports.POST(new Request("https://bookkeeping.test/api/workspace", { method: "POST", body: JSON.stringify(data) }));
    return { status: response.status, body: await response.json() };
  } };
}

test("actual workspace API rejects old clients and stale writes, authenticates history and downloads only the selected administration", async () => {
  const db = database(), api = await workspaceApi(db);
  const administrations = initial().administrations.map((a) => ({ ...a, name: a.id, fiscalYear: 2024 }));
  const setup = await api.post({ action: "setup", workspaceName: "Test", email: "test@example.invalid", pin: "123456", administrations });
  assert.equal(setup.status, 200); assert.ok(setup.body.revision);
  assert.equal((await api.post({ action: "history", pin: "000000" })).status, 401);
  const publicResponse = await api.GET();
  assert.equal(publicResponse.headers.get("Cache-Control"), "no-store");
  assert.equal(JSON.stringify(await publicResponse.json()).includes("pinHash"), false);
  const legacy = await api.post({ action: "save", pin: "123456", administrations });
  assert.equal(legacy.status, 428); assert.equal(legacy.body.code, "UPDATE_REQUIRED");
  const changed = structuredClone(administrations); changed[0].entries.push({ id: "new", invoiceNumber: "2024-0046" });
  const writes = await Promise.all([
    api.post({ action: "save", pin: "123456", administrations: changed, revision: setup.body.revision }),
    api.post({ action: "save", pin: "123456", administrations, revision: setup.body.revision }),
  ]);
  assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
  const login = await api.post({ action: "login", pin: "123456" });
  assert.deepEqual(login.body.administrations, changed);
  const history = await api.post({ action: "history", pin: "123456" });
  assert.equal(history.body.history[0].revision, setup.body.revision);
  const snapshot = await api.post({ action: "snapshot", pin: "123456", revision: setup.body.revision, administrationId: "edego" });
  assert.deepEqual(snapshot.body, { administration: administrations[0] });
  assert.equal((await api.post({ action: "snapshot", pin: "123456", revision: setup.body.revision, administrationId: "missing" })).status, 404);
  assert.equal((await api.post({ action: "snapshot", pin: "000000", revision: setup.body.revision, administrationId: "edego" })).status, 401);
  assert.deepEqual((await api.post({ action: "login", pin: "123456" })).body.administrations, changed);
});

test("production API reports unavailable database instead of silently using a different local file", async () => {
  const api = await workspaceApi(null);
  assert.equal((await api.GET()).status, 503);
  assert.equal((await api.post({ action: "login", pin: "123456" })).status, 503);
});
