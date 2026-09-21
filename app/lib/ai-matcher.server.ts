type Candidate = {
  sku: string;
  title: string;
  family: string;
  productClass: string;
  description: string;
  keywords: string;
};

type MatchItem = {
  row: number;
  input: string;
  brand: string;
  itemId: string;
  preliminaryIdentification: string;
  preliminaryToolFamily: string;
  candidates: Candidate[];
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "row",
          "identifiedAs",
          "toolFamily",
          "candidateSku",
          "equivalence",
          "confidence",
          "requiresReview",
          "reason",
          "warnings",
          "sources",
          "setOutcome",
          "competitorSetSource",
          "sourceAccessedAt",
          "documentedComponents",
        ],
        properties: {
          row: { type: "integer" },
          identifiedAs: { type: "string" },
          toolFamily: { type: "string" },
          candidateSku: { type: "string" },
          equivalence: {
            type: "string",
            enum: ["equivalent", "closest-alternative", "no-equivalent"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          requiresReview: { type: "boolean" },
          reason: { type: "string" },
          warnings: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "string" } },
          setOutcome: {
            type: "string",
            enum: ["not-a-set", "exact-set", "comparable-set", "component-alternative", "incomplete"],
          },
          competitorSetSource: { type: "string" },
          sourceAccessedAt: { type: "string" },
          documentedComponents: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["description", "quantity", "evidence"],
              properties: {
                description: { type: "string" },
                quantity: { type: "string" },
                evidence: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

function short(value: unknown, max = 600) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sanitizeMatchItems(value: unknown): MatchItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((raw, index) => {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    return {
      row: Number.isInteger(Number(item.row)) ? Number(item.row) : index + 1,
      input: short(item.input, 700),
      brand: short(item.brand, 80),
      itemId: short(item.itemId, 120),
      preliminaryIdentification: short(item.preliminaryIdentification, 180),
      preliminaryToolFamily: short(item.preliminaryToolFamily, 100),
      candidates: candidates.slice(0, 12).map((rawCandidate) => {
        const candidate =
          rawCandidate && typeof rawCandidate === "object"
            ? (rawCandidate as Record<string, unknown>)
            : {};
        return {
          sku: short(candidate.sku, 80),
          title: short(candidate.title, 180),
          family: short(candidate.family, 100),
          productClass: short(candidate.productClass, 40),
          description: short(candidate.description, 500),
          keywords: short(candidate.keywords, 240),
        };
      }).filter((candidate) => candidate.sku && candidate.title),
    };
  }).filter((item) => item.input);
}

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  return "";
}

export async function analyzeToolMatches(value: unknown, signal?: AbortSignal) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Response("Enhanced matching is not configured yet.", { status: 503 });
  }
  const items = sanitizeMatchItems(value);
  if (!items.length) throw new Response("No matching rows were supplied.", { status: 400 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MATCHER_MODEL || "gpt-5.6-sol",
      store: false,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      max_tool_calls: Math.min(12, Math.max(5, Math.ceil(items.length / 3))),
      max_output_tokens: 6000,
      instructions:
        "You are a cautious industrial-tool cross-reference specialist. First identify each requested item accurately, even when it is outside the TengTools range. Use web search when a competitor brand/model or ambiguous trade term needs verification. Source priority is: manufacturer product page, official catalogue, authorised or reputable distributor, then other reliable product documentation. A preliminaryIdentification or preliminaryToolFamily may come from an earlier pass: verify it rather than trusting it blindly. Then assess only the supplied TengTools candidates. candidateSku must be one of the supplied candidate SKUs or an empty string. TengTools item IDs are exact identities: preserve every letter, number, and suffix, and never treat a similar or prefix-related item ID as the same product. Never select a product merely because one generic keyword overlaps. A singular requested tool must match one individual product, never a set, assortment, tray, EVA module or kit. For a requested set, search first for a materially equivalent TengTools set. If there is no reliable direct match, identify the competitor brand and model, find a reliable written source that documents its contents, and return those contents individually. Never infer set contents from a photograph alone. If written contents cannot be verified, return setOutcome incomplete, no-equivalent, no documented components, and require review. Set sourceAccessedAt to today's ISO date when research is used. Treat tool family, operating method, dimensions, capacity, electrical rating, drive size, material, and set composition as hard evidence. Equivalent means the same practical purpose with no material capability mismatch. If the closest candidate differs materially, label it closest-alternative, require review, and state every important mismatch. If no same-purpose candidate exists, return no-equivalent and an empty candidateSku. Do not turn a closest alternative into a confirmed equivalent.",
      input: JSON.stringify({ items }),
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "tool_match_assessment",
          strict: true,
          schema: responseSchema,
        },
      },
    }),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object"
      ? short((payload.error as Record<string, unknown>).message, 300)
      : "";
    throw new Response(error || "Enhanced matching failed.", { status: response.status });
  }

  const parsed = JSON.parse(responseText(payload) || "{}") as {
    matches?: Array<Record<string, unknown>>;
  };
  const byRow = new Map(items.map((item) => [item.row, item]));
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  return matches.map((match) => {
    const row = Number(match.row);
    const source = byRow.get(row);
    const requestedCandidateSku = short(match.candidateSku, 80);
    const permitted = source?.candidates.some((candidate) => candidate.sku === requestedCandidateSku);
    const confidence = ["high", "medium", "low"].includes(String(match.confidence))
      ? String(match.confidence)
      : "low";
    let equivalence = ["equivalent", "closest-alternative", "no-equivalent"].includes(String(match.equivalence))
      ? String(match.equivalence)
      : "no-equivalent";
    if (!permitted || !requestedCandidateSku || equivalence === "no-equivalent") {
      equivalence = "no-equivalent";
    }
    const candidateSku = equivalence === "no-equivalent" ? "" : requestedCandidateSku;
    return {
      row,
      identifiedAs: short(match.identifiedAs, 180),
      toolFamily: short(match.toolFamily, 100),
      candidateSku,
      equivalence,
      confidence,
      requiresReview: Boolean(match.requiresReview) || equivalence !== "equivalent" || confidence !== "high",
      reason: short(match.reason, 500),
      warnings: Array.isArray(match.warnings) ? match.warnings.map((warning) => short(warning, 240)).filter(Boolean).slice(0, 5) : [],
      sources: Array.isArray(match.sources) ? match.sources.map((sourceUrl) => short(sourceUrl, 500)).filter((sourceUrl) => /^https:\/\//i.test(sourceUrl)).slice(0, 5) : [],
      setOutcome: ["not-a-set", "exact-set", "comparable-set", "component-alternative", "incomplete"].includes(String(match.setOutcome)) ? String(match.setOutcome) : "not-a-set",
      competitorSetSource: /^https:\/\//i.test(short(match.competitorSetSource, 500)) ? short(match.competitorSetSource, 500) : "",
      sourceAccessedAt: /^\d{4}-\d{2}-\d{2}$/.test(short(match.sourceAccessedAt, 10)) ? short(match.sourceAccessedAt, 10) : "",
      documentedComponents: Array.isArray(match.documentedComponents) ? match.documentedComponents.map((rawComponent) => {
        const component = rawComponent && typeof rawComponent === "object" ? rawComponent as Record<string, unknown> : {};
        return { description: short(component.description, 240), quantity: short(component.quantity, 40), evidence: short(component.evidence, 300) };
      }).filter((component) => component.description).slice(0, 100) : [],
    };
  }).filter((match) => byRow.has(match.row));
}
