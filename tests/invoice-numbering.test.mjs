import assert from "node:assert/strict";
import test from "node:test";
import { getNextInvoiceNumber, hasDuplicateSalesInvoice, incrementInvoiceNumber, isValidInvoiceSequence } from "../app/lib/invoice-numbering.ts";

const invoice = (number, date = "2026-10-14", type = "income", id = number) => ({ id, date, type, invoiceNumber: number });
const admin = (entries = [], nextInvoiceNumber) => ({ fiscalYear: 2026, entries, nextInvoiceNumber });

test("continues existing sales series and preserves padding and prefixes", () => {
  assert.equal(getNextInvoiceNumber(admin()), "2026-0001");
  assert.equal(getNextInvoiceNumber(admin([invoice("2026-0160")])), "2026-0161");
  assert.equal(getNextInvoiceNumber(admin([invoice("VOR20250001")])), "VOR20250002");
  assert.equal(incrementInvoiceNumber("FAC-0099"), "FAC-0100");
  assert.equal(incrementInvoiceNumber("99999999999999999999"), "100000000000000000000");
});

test("uses the maximum of the selected series independent of dates or ordering", () => {
  assert.equal(getNextInvoiceNumber(admin([invoice("2026-0160", "2026-10-01"), invoice("2026-0150")])), "2026-0161");
  assert.equal(getNextInvoiceNumber(admin([invoice("fac-0100")], "FAC-0001")), "FAC-0101");
});

test("isolates administrations, suppliers and other series", () => {
  assert.equal(getNextInvoiceNumber(admin([invoice("2026-9999", undefined, "expense"), invoice("2026-0007")])), "2026-0008");
  assert.equal(getNextInvoiceNumber(admin([invoice("OLD-9999")], "NEW-0001")), "NEW-0001");
  assert.equal(getNextInvoiceNumber(admin()), "2026-0001");
});

test("retains the saved next number after deleting or editing a sales entry", () => {
  const next = getNextInvoiceNumber(admin([invoice("2026-0160")]));
  assert.equal(getNextInvoiceNumber(admin([], next)), "2026-0161");
  assert.equal(getNextInvoiceNumber(admin([invoice("2026-0200")], next)), "2026-0201");
  assert.equal(getNextInvoiceNumber(admin([invoice("2026-0001")], next)), "2026-0161");
});

test("rejects invalid sequences and detects duplicate sales numbers, excluding the edited entry", () => {
  assert.equal(isValidInvoiceSequence("FAC-"), false);
  assert.equal(isValidInvoiceSequence(""), false);
  assert.equal(isValidInvoiceSequence("1".repeat(81)), false);
  assert.equal(isValidInvoiceSequence(" FAC-0001 "), true);
  const entries = [invoice("FAC-0001", undefined, "income", "a"), invoice("FAC-0002", undefined, "expense", "b")];
  assert.equal(hasDuplicateSalesInvoice(entries, " fac-0001 "), true);
  assert.equal(hasDuplicateSalesInvoice(entries, "FAC-0001", "a"), false);
  assert.equal(hasDuplicateSalesInvoice(entries, "FAC-0002"), false);
});
