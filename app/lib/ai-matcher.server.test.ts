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
  assert.equal(sanitized[0].candidates.length, 12);
  assert.equal(sanitized[0].candidates[0].description.length, 500);
  assert.equal("secret" in sanitized[0], false);
  assert.equal("internal" in sanitized[0].candidates[0], false);
});

test("AI matcher preserves bounded preliminary identification for a refined pass", () => {
  const sanitized = sanitizeMatchItems([{
    row: 7,
    input: "Ambiguous competitor item",
    preliminaryIdentification: "Non-contact AC voltage detector",
    preliminaryToolFamily: "voltage tester",
    candidates: Array.from({ length: 15 }, (_value, index) => ({
      sku: `SKU-${index}`,
      title: `Candidate ${index}`,
    })),
  }]);
  assert.equal(sanitized[0].preliminaryIdentification, "Non-contact AC voltage detector");
  assert.equal(sanitized[0].preliminaryToolFamily, "voltage tester");
  assert.equal(sanitized[0].candidates.length, 12);
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

test("AI matcher preserves set identity and never imports arbitrary fields", () => {
  const sanitized = sanitizeMatchItems([{
    row: 3,
    input: "Competitor 12 piece electrician set MODEL-12",
    brand: "Competitor",
    itemId: "MODEL-12",
    preliminaryIdentification: "electrician tool set",
    preliminaryToolFamily: "tool-kit",
    candidates: [{ sku: "KIT-1", title: "Electrician set", productClass: "set" }],
    documentedComponents: [{ description: "should not enter the request" }],
  }]);
  assert.equal(sanitized[0].brand, "Competitor");
  assert.equal(sanitized[0].itemId, "MODEL-12");
  assert.equal("documentedComponents" in sanitized[0], false);
});
