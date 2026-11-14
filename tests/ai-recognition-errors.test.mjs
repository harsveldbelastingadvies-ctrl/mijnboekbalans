import test from "node:test";
import assert from "node:assert/strict";
import { bankRecognitionFailure } from "../app/lib/ai-recognition-errors.ts";
test("bank errors distinguish empty credits, spend caps, usage limits and temporary rate limits", () => {
  assert.match(bankRecognitionFailure(429, { error: { code: "credit_balance_exhausted" } }), /tegoed is op/);
  assert.match(bankRecognitionFailure(429, { error: { code: "project_spend_limit_exceeded" } }), /bestedingslimiet/);
  assert.match(bankRecognitionFailure(429, { error: { code: "organization_usage_limit_exceeded" } }), /gebruikslimiet/);
  assert.match(bankRecognitionFailure(429, { error: { type: "insufficient_quota" } }), /Billing en Limits/);
  assert.match(bankRecognitionFailure(429, {}), /snelheidslimiet/);
});
test("authentication, access and bad requests do not misleadingly tell the user to buy credits", () => {
  assert.match(bankRecognitionFailure(401, {}), /API-sleutel niet/);
  assert.match(bankRecognitionFailure(403, {}), /geen toegang/);
  assert.match(bankRecognitionFailure(400, {}), /bewijst geen tekort aan credits/);
  assert.match(bankRecognitionFailure(503, {}), /tijdelijke storing/);
});
test("raw provider errors, credentials and document text are not exposed", () => {
  const output = bankRecognitionFailure(400, { error: { message: "sk-secret private PDF text", code: "sk-secret", type: "private document" } });
  assert.equal(output.includes("sk-secret"), false); assert.equal(output.includes("private"), false); assert.match(output, /HTTP 400/);
});
