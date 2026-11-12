import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { WorkspaceSync, WorkspaceSaveError, preserveBrowserCache, browserRecoveryCopies, browserCacheKey, recoveryPrefix } from "../app/lib/workspace-sync.ts";
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function harness(save) {
  const states = [], persisted = [], saved = []; let cleared = 0;
  const sync = new WorkspaceSync(["0045"], "old", {
    save, state: (state) => states.push(state), persist: (p) => persisted.push(p),
    clear: () => cleared++, saved: (profile) => saved.push(profile),
  });
  return { sync, states, persisted, saved, cleared: () => cleared };
}

test("login alone does not save; edits arriving during a request use its acknowledged revision", async () => {
  const one = deferred(), two = deferred(), calls = [];
  const h = harness((value, revision) => { calls.push({ value, revision }); return calls.length === 1 ? one.promise : two.promise; });
  await h.sync.flush(); assert.equal(calls.length, 0);
  h.sync.update(["0045", "0046"]); const flushing = h.sync.flush();
  h.sync.update(["0045", "0046", "0047"]); await h.sync.flush();
  assert.equal(calls.length, 1); assert.equal(h.cleared(), 0);
  one.resolve({ revision: "new-1", profile: {} }); await new Promise(setImmediate);
  assert.equal(calls.length, 2); assert.equal(calls[1].revision, "new-1");
  assert.deepEqual(calls[1].value, ["0045", "0046", "0047"]);
  assert.equal(h.states.includes("saved"), false);
  two.resolve({ revision: "new-2", profile: {} }); await flushing;
  assert.equal(h.states.at(-1), "saved"); assert.equal(h.sync.dirty, false); assert.equal(h.cleared(), 1);
});

test("offline failure preserves the latest input and retries it without an unsafe overwrite", async () => {
  const calls = []; let fails = true;
  const h = harness(async (value, revision) => { calls.push({ value, revision }); if (fails) throw new Error("offline"); return { revision: "new", profile: {} }; });
  h.sync.update(["0045", "0046"]); await h.sync.flush();
  assert.equal(h.states.at(-1), "error"); assert.equal(h.sync.dirty, true); assert.equal(h.cleared(), 0);
  h.sync.update(["0045", "0046", "0047"]); fails = false; await h.sync.flush();
  assert.deepEqual(calls[1], { value: ["0045", "0046", "0047"], revision: "old" });
  assert.equal(h.states.at(-1), "saved");
});

test("stale and legacy clients stop saving and keep their input available for download", async () => {
  for (const code of ["REVISION_CONFLICT", "UPDATE_REQUIRED"]) {
    let calls = 0;
    const h = harness(async () => { calls++; throw new WorkspaceSaveError("conflict", code); });
    h.sync.update(["0045", "0085"]); await h.sync.flush();
    h.sync.update(["0045", "0085", "0086"]); await h.sync.flush();
    assert.equal(calls, 1); assert.equal(h.states.at(-1), "conflict");
    assert.equal(h.sync.dirty, true); assert.equal(h.cleared(), 0);
    assert.deepEqual(h.persisted.at(-1).administrations, ["0045", "0085", "0086"]);
  }
});

test("a lost or incomplete acknowledgement is never labeled saved", async () => {
  const h = harness(async () => ({ profile: {} })); h.sync.update(["0046"]); await h.sync.flush();
  assert.equal(h.states.at(-1), "error"); assert.equal(h.sync.dirty, true); assert.equal(h.cleared(), 0);
});

function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i], getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
test("login preserves a differing or corrupt browser cache before using the server version", () => {
  const cache = storage(), local = [{ id: "edego", entries: ["0045", "0085"] }], server = [{ id: "edego", entries: ["0045"] }];
  cache.setItem(browserCacheKey, JSON.stringify(local));
  preserveBrowserCache(cache, server, "before-login");
  cache.setItem(browserCacheKey, JSON.stringify(server));
  assert.deepEqual(browserRecoveryCopies(cache)[0].contents, local);
  preserveBrowserCache(cache, server, "same-value");
  assert.equal(browserRecoveryCopies(cache).length, 1);
  cache.setItem(browserCacheKey, "broken-but-recoverable"); preserveBrowserCache(cache, server, "corrupt");
  assert.equal(browserRecoveryCopies(cache)[1].contents, "broken-but-recoverable");
});

test("pending copies from other tabs or a previous reload are left intact", () => {
  const cache = storage();
  for (const id of ["tab-a", "tab-b", "old-page"]) cache.setItem(`${recoveryPrefix}${id}`, JSON.stringify({ administrations: [id], revision: "old" }));
  cache.removeItem(`${recoveryPrefix}tab-a`);
  assert.deepEqual(browserRecoveryCopies(cache).map((copy) => copy.contents.administrations[0]).sort(), ["old-page", "tab-b"]);
});

test("repeated login does not duplicate the same recovery copy", () => {
  const cache = storage(); cache.setItem(browserCacheKey, '["0085"]');
  preserveBrowserCache(cache, ["0045"], "first"); preserveBrowserCache(cache, ["0045"], "second");
  assert.equal(browserRecoveryCopies(cache).length, 1);
});

test("undoing an unsaved change clears its pending copy", () => {
  const h = harness(async () => { throw new Error("must not save"); });
  h.sync.update(["0045", "0046"]); h.sync.update(["0045"]);
  assert.equal(h.sync.dirty, false); assert.equal(h.states.at(-1), "saved"); assert.equal(h.cleared(), 1);
});

test("undo after a lost acknowledgement or conflict cannot falsely claim the old baseline is current", async () => {
  for (const failure of [new Error("response lost"), new WorkspaceSaveError("another session saved", "REVISION_CONFLICT")]) {
    const h = harness(async () => { throw failure; });
    h.sync.update(["0045", "0046"]); await h.sync.flush(); h.sync.update(["0045"]);
    assert.equal(h.sync.dirty, true); assert.equal(h.cleared(), 0); assert.equal(h.states.includes("saved"), false);
    assert.deepEqual(h.persisted.at(-1).administrations, ["0045"]);
  }
});

function pageSession(cache) {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = source.indexOf("  const beginWorkspaceSession = ");
  const end = source.indexOf("  const setupWorkspace = ", start);
  const code = ts.transpileModule(source.slice(start, end) + "\nglobalThis.begin = beginWorkspaceSession;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const state = {}, calls = []; let id = 0;
  const context = { WorkspaceSync, WorkspaceSaveError, preserveBrowserCache, browserRecoveryCopies, recoveryPrefix,
    storageKey: browserCacheKey, uid: () => `copy-${++id}`, window: { localStorage: cache },
    sync: { current: null }, pendingCacheKey: { current: "" },
    workspaceRequest: async (body) => { calls.push(body); return { revision: "server-2", profile: {} }; },
  };
  for (const field of ["CacheError", "RecoveryCount", "SyncState", "SaveStatus", "Administrations", "ActiveId", "WorkspaceProfile", "WorkspacePin", "WorkspaceState"]) {
    context[`set${field}`] = (value) => { state[field] = value; };
  }
  vm.runInNewContext(code, context);
  return { state, calls, context, begin: context.begin };
}

test("actual page login preserves old invoice input before loading the server and does not autosave just for login", async () => {
  const cache = storage(), local = [{ id: "edego", entries: ["0045", "0085"] }], server = [{ id: "edego", entries: ["0045"] }];
  cache.setItem(browserCacheKey, JSON.stringify(local));
  const h = pageSession(cache);
  h.begin({ administrations: server, profile: {}, revision: "server-1" }, "123456");
  assert.deepEqual(browserRecoveryCopies(cache)[0].contents, local);
  assert.equal(h.state.WorkspaceState, "unlocked"); assert.equal(h.state.RecoveryCount, 1);
  await h.context.sync.current.flush(); assert.equal(h.calls.length, 0);
  h.context.sync.current.update(local); await h.context.sync.current.flush();
  assert.equal(h.calls[0].revision, "server-1");
  assert.deepEqual(JSON.parse(cache.getItem(browserCacheKey)), local);
  assert.equal(h.state.SaveStatus, "Opgeslagen op server");
});

test("actual page with full browser storage preserves the old cache and still allows acknowledged server saving", async () => {
  const cache = storage(), original = '[{"id":"edego","entries":["0085"]}]';
  cache.setItem(browserCacheKey, original);
  cache.setItem = () => { throw new Error("quota exceeded"); };
  const h = pageSession(cache);
  h.begin({ administrations: [{ id: "edego", entries: ["0045"] }], profile: {}, revision: "server-1" }, "123456");
  assert.equal(cache.getItem(browserCacheKey), original);
  assert.equal(h.state.WorkspaceState, "unlocked"); assert.ok(h.state.CacheError);
  h.context.sync.current.update([{ id: "edego", entries: ["0045", "0046"] }]); await h.context.sync.current.flush();
  assert.equal(h.calls.length, 1); assert.equal(h.state.SaveStatus, "Opgeslagen op server");
  assert.equal(cache.getItem(browserCacheKey), original);
});
