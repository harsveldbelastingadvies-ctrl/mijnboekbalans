import assert from "node:assert/strict";
import test from "node:test";
import { formatDutchDate, parseDutchDate, formatDutchTimestamp } from "../app/lib/dutch-date.ts";
test("Dutch calendar dates are padded and round-trip to the existing ISO storage format", () => {
  assert.equal(formatDutchDate("2026-01-03"), "03-01-2026");
  assert.equal(parseDutchDate("03-01-2026"), "2026-01-03");
  assert.equal(parseDutchDate("29-02-2028"), "2028-02-29");
  for (const invalid of ["29-02-2026", "31-04-2026", "10/31/2026", "2026-10-31", "1-2-2026", ""]) assert.equal(parseDutchDate(invalid), "");
  assert.equal(formatDutchDate(undefined), "");
});
test("timestamp display uses two-digit Dutch dates and the Netherlands timezone", () => {
  assert.equal(formatDutchTimestamp("2026-10-31T23:30:00Z"), "01-11-2026, 00:30");
  assert.equal(formatDutchTimestamp("2026-06-01T22:05:00Z"), "02-06-2026, 00:05");
});
