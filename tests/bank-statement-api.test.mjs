import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import vm from "node:vm";
import { normalizeBankStatement } from "../app/lib/bank-reconciliation.ts";
import { documentFormat, maxDocumentSize } from "../app/lib/documents.ts";
import { readLimitedBody } from "../app/lib/request-body.ts";

async function harness({ key = "example-key", provider = {}, providerStatus = 200, throwFetch = false } = {}) {
  const state = { archives: 0, calls: [], schemas: 0 };
  const nativeRequire = createRequire(import.meta.url), compiledModule = { exports: {} };
  const raw = readFileSync(new URL("../app/api/bank-statements/analyze/route.ts", import.meta.url), "utf8");
  const context = {
    exports: compiledModule.exports, module: compiledModule, Buffer, Request, Response, File, FormData, Uint8Array, AbortSignal,
    process: { env: key ? { OPENAI_API_KEY: key } : {} },
    fetch: async (url, init) => { state.calls.push({ url, body: JSON.parse(init.body) }); if (throwFetch) throw new Error("upstream failed: secret details"); return new Response(JSON.stringify(provider), { status: providerStatus, headers: { "Content-Type": "application/json" } }); },
    require: (name) => {
      if (name === "next/server") return { NextResponse: { json: (value, init) => new Response(JSON.stringify(value), init) } };
      if (name.includes("workspace-access")) return { getDocumentDatabase: () => ({}), authorizeDocumentAccess: async (_db, pin, admin) => pin === "123456" && admin === "edego" };
      if (name.includes("document-store")) return { ensureDocumentSchema: async () => { state.schemas++; }, saveDocument: async (_db, admin, file, year, category) => { assert.equal(admin, "edego"); assert.equal(year, 2024); assert.equal(category, "Bank"); state.archives++; return { id: "doc", digest: "digest", name: file.name }; } };
      if (name.includes("request-body")) return { readLimitedBody };
      if (name.endsWith("/documents")) return { documentFormat, maxDocumentSize };
      if (name.includes("bank-reconciliation")) return { normalizeBankStatement };
      return nativeRequire(name);
    },
  };
  vm.runInNewContext(ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { state, post: async ({ pin = "123456", admin = "edego", consent = true, filename = "afschrift.pdf", content = "%PDF-1.7\nsynthetic test", large = false } = {}) => {
    const form = new FormData(); form.set("pin", pin); form.set("administrationId", admin); form.set("aiConsent", String(consent)); form.set("year", "2024"); form.set("file", new File([content], filename, { type: "application/pdf" }));
    const response = await compiledModule.exports.POST(new Request("https://bookkeeping.test/api/bank-statements/analyze", { method: "POST", body: form, headers: large ? { "content-length": String(maxDocumentSize + 65537) } : {} }));
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  } };
}
const analysis = { account: "NL00TEST", currency: "EUR", openingBalance: 0, closingBalance: 121, complete: true, note: "pagina 1", transactions: [{ date: "2024-08-15", amount: 121, currency: "EUR", description: "2024-0114", counterparty: "Klant", bankId: "", page: 1 }] };
test("PIN and administration membership are checked before archiving or AI", async () => {
  const api = await harness();
  assert.equal((await api.post({ pin: "000000" })).status, 401);
  assert.equal((await api.post({ admin: "other" })).status, 401);
  assert.equal(api.state.archives, 0); assert.equal(api.state.calls.length, 0);
});
test("explicit opt-in is required to send a bank PDF to OpenAI; archiving alone stays available", async () => {
  const api = await harness(), result = await api.post({ consent: false });
  assert.equal(result.status, 200); assert.equal(result.cache, "no-store"); assert.equal(api.state.archives, 1); assert.equal(api.state.calls.length, 0);
  assert.equal(result.body.statement.documentId, "doc"); assert.equal(result.body.statement.verified, false);
  assert.equal(result.body.recognized, false); assert.deepEqual(result.body.statement.transactions, []);
});
test("missing AI configuration does not lose the PDF or invent bank rows", async () => {
  const api = await harness({ key: "" }), result = await api.post();
  assert.equal(api.state.archives, 1); assert.equal(api.state.calls.length, 0);
  assert.equal(result.body.recognized, false); assert.match(result.body.notice, /niet ingesteld/);
  assert.equal(result.body.statement.openingBalance, null);
});
test("valid PDF analysis uses strict schema, disables response storage, and returns unverified source-linked rows", async () => {
  const api = await harness({ provider: { status: "completed", output_text: JSON.stringify(analysis) } }), result = await api.post();
  assert.equal(result.body.recognized, true); assert.equal(result.body.statement.verified, false);
  assert.equal(result.body.statement.transactions[0].date, "2024-08-15"); assert.equal(result.body.statement.transactions[0].id, "digest:0");
  const call = api.state.calls[0]; assert.equal(call.url, "https://api.openai.com/v1/responses"); assert.equal(call.body.store, false); assert.equal(call.body.text.format.strict, true);
  assert.match(call.body.input[1].content[0].file_data, /^data:application\/pdf;base64,/);
  assert.equal(JSON.stringify(call.body).includes("123456"), false);
});
test("incomplete, refused, malformed, oversized-batch or failed AI results never become partial bank imports", async () => {
  for (const setup of [{ provider: { status: "incomplete", output_text: JSON.stringify(analysis) } }, { provider: {} }, { provider: { output_text: "not json" } }, { providerStatus: 500, provider: { error: "secret details" } }, { throwFetch: true }, { provider: { output_text: JSON.stringify({ ...analysis, transactions: Array(501).fill(analysis.transactions[0]) }) } }]) {
    const api = await harness(setup), result = await api.post();
    assert.equal(result.status, 200); assert.equal(api.state.archives, 1); assert.equal(result.body.recognized, false);
    assert.deepEqual(result.body.statement.transactions, []); assert.equal(JSON.stringify(result.body).includes("secret details"), false);
  }
});
test("non-PDF, false PDF signatures and oversized requests are rejected without AI", async () => {
  const api = await harness();
  assert.equal((await api.post({ filename: "invoer.xlsx" })).status, 400);
  assert.equal((await api.post({ content: "geen PDF" })).status, 400);
  assert.equal((await api.post({ large: true })).status, 413);
  assert.equal(api.state.archives, 0); assert.equal(api.state.calls.length, 0);
});
