import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMatchItems } from "./ai-matcher.server.ts";

test("AI matcher input is bounded and strips unexpected fields", () => {
  const items = Array.from({ length: 35 }, (_, index) => ({
    row: index + 1,
    input: `Competitor tool ${index}`,
    secret: "must not pass through",
    candidates: Array.from({ length: 12 }, (_value, candidateIndex) => ({
      sku: `SKU-${candidateIndex}`,
      title: `Candidate ${candidateIndex}`,
      family: "test-family",
      productClass: "individual",
      description: "x".repeat(900),
      keywords: "keyword",
      internal: "must not pass through",
    })),
  }));

  const sanitized = sanitizeMatchItems(items);
  assert.equal(sanitized.length, 30);
  assert.equal(sanitized[0].candidates.length, 8);
  assert.equal(sanitized[0].candidates[0].description.length, 500);
  assert.equal("secret" in sanitized[0], false);
  assert.equal("internal" in sanitized[0].candidates[0], false);
});

test("AI matcher ignores empty rows and candidates", () => {
  const sanitized = sanitizeMatchItems([
    { row: 1, input: "", candidates: [{ sku: "A", title: "A" }] },
    { row: 2, input: "Voltage tester", candidates: [{ sku: "", title: "Missing SKU" }] },
  ]);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].row, 2);
  assert.deepEqual(sanitized[0].candidates, []);
});
