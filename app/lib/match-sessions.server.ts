import { randomUUID } from "node:crypto";

export const SESSION_TYPE = "$app:match_session";
export const MAX_ROWS = 500;
export const MAX_COMPONENTS = 100;
export const MAX_PAYLOAD_BYTES = 240_000;
const CHUNK_BYTES = 60_000;

export type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type MatchSessionSummary = {
  id: string;
  handle: string;
  name: string;
  customerId: string;
  customerName: string;
  sourceFile: string;
  status: string;
  rowCount: number;
  matchedCount: number;
  reviewCount: number;
  ignoredCount: number;
  matcherVersion: number;
  createdAt: string;
  savedAt: string;
  updatedAt: string;
};

export type MatchSessionRecord = MatchSessionSummary & {
  payload: MatchSessionPayload;
};

export type MatchSessionPayload = {
  rows: Array<Record<string, unknown>>;
  nextRow: number;
  matcherVersion: number;
  savedAt: string;
  sourceFile?: string;
};

type MetaobjectNode = {
  id: string;
  handle: string;
  updatedAt: string;
  fields: Array<{ key: string; value: string | null }>;
};

const SESSION_FIELDS = `
  id
  handle
  updatedAt
  fields {
    key
    value
  }
`;

const CUSTOMER_SESSIONS_QUERY = `#graphql
  query CustomerMatchSessions($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      sessions: metafield(key: "match_sessions") {
        jsonValue
        references(first: 100) {
          nodes {
            ... on Metaobject {
              ${SESSION_FIELDS}
            }
          }
        }
      }
    }
  }
`;

const ALL_SESSIONS_QUERY = `#graphql
  query MatchSessions($first: Int!, $after: String) {
    metaobjects(
      type: "$app:match_session"
      first: $first
      after: $after
      sortKey: "updated_at"
      reverse: true
    ) {
      nodes {
        ${SESSION_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const SESSION_BY_HANDLE_QUERY = `#graphql
  query MatchSession($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      ${SESSION_FIELDS}
    }
  }
`;

const UPSERT_SESSION_MUTATION = `#graphql
  mutation SaveMatchSession(
    $handle: MetaobjectHandleInput!
    $metaobject: MetaobjectUpsertInput!
  ) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
        updatedAt
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const LINK_SESSION_MUTATION = `#graphql
  mutation LinkMatchSession($ownerId: ID!, $value: String!) {
    metafieldsSet(
      metafields: [{ ownerId: $ownerId, key: "match_sessions", value: $value }]
    ) {
      metafields {
        id
        key
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

function fieldMap(node: MetaobjectNode) {
  return Object.fromEntries(node.fields.map((field) => [field.key, field.value ?? ""]));
}

function numberValue(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nodeToSession(node: MetaobjectNode): MatchSessionRecord {
  const fields = fieldMap(node);
  const payloadText = [
    fields.payload_1,
    fields.payload_2,
    fields.payload_3,
    fields.payload_4,
  ].join("");
  let payload: MatchSessionPayload = {
    rows: [],
    nextRow: 1,
    matcherVersion: numberValue(fields.matcher_version),
    savedAt: fields.saved_at || node.updatedAt,
  };

  if (payloadText) {
    try {
      payload = JSON.parse(payloadText) as MatchSessionPayload;
    } catch {
      // Keep the summary accessible even if legacy payload data is malformed.
    }
  }

  return {
    id: node.id,
    handle: node.handle,
    name: fields.name || "Untitled session",
    customerId: fields.customer_id,
    customerName: fields.customer_name || "Shopify customer",
    sourceFile: fields.source_file,
    status: fields.status || "In progress",
    rowCount: numberValue(fields.row_count),
    matchedCount: numberValue(fields.matched_count),
    reviewCount: numberValue(fields.review_count),
    ignoredCount: numberValue(fields.ignored_count),
    matcherVersion: numberValue(fields.matcher_version),
    createdAt: fields.created_at || node.updatedAt,
    savedAt: fields.saved_at || node.updatedAt,
    updatedAt: node.updatedAt,
    payload,
  };
}

function clampText(value: unknown, max = 4_000) {
  return typeof value === "string" ? value.slice(0, max) : value;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 7) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return clampText(value);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_COMPONENTS).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [key.slice(0, 80), sanitizeValue(item, depth + 1)]),
    );
  }
  return null;
}

export function sanitizePayload(input: unknown): MatchSessionPayload {
  const source =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rows = Array.isArray(source.rows)
    ? source.rows
        .slice(0, MAX_ROWS)
        .map((row) => sanitizeValue(row))
        .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    : [];
  const now = new Date().toISOString();

  return {
    rows,
    nextRow: Math.max(1, Math.floor(Number(source.nextRow) || rows.length + 1)),
    matcherVersion: Math.max(0, Math.floor(Number(source.matcherVersion) || 0)),
    savedAt: now,
    ...(typeof source.sourceFile === "string"
      ? { sourceFile: source.sourceFile.slice(0, 255) }
      : {}),
  };
}

export function splitPayload(payload: MatchSessionPayload) {
  const value = JSON.stringify(payload);
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new Response(
      "This session is too large to save. Split it into smaller matching sessions.",
      { status: 413 },
    );
  }

  const chunks: string[] = [];
  let remaining = value;
  while (remaining) {
    let low = 1;
    let high = Math.min(remaining.length, CHUNK_BYTES);
    let size = 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (Buffer.byteLength(remaining.slice(0, mid), "utf8") <= CHUNK_BYTES) {
        size = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    chunks.push(remaining.slice(0, size));
    remaining = remaining.slice(size);
  }

  return [...chunks, "", "", ""].slice(0, 4);
}

async function graphqlJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    throw new Response(body.errors.map((error) => error.message).join("; "), {
      status: 502,
    });
  }
  if (!body.data) throw new Response("Shopify returned no data.", { status: 502 });
  return body.data;
}

export function customerGid(customerId: string) {
  return customerId.startsWith("gid://shopify/Customer/")
    ? customerId
    : `gid://shopify/Customer/${customerId}`;
}

export async function getCustomerSessions(
  admin: AdminGraphqlClient,
  customerId: string,
) {
  const id = customerGid(customerId);
  const data = await graphqlJson<{
    customer: null | {
      id: string;
      firstName: string | null;
      lastName: string | null;
      sessions: null | {
        jsonValue: unknown;
        references: { nodes: MetaobjectNode[] };
      };
    };
  }>(
    await admin.graphql(CUSTOMER_SESSIONS_QUERY, {
      variables: { id },
    }),
  );
  if (!data.customer) throw new Response("Customer not found.", { status: 404 });

  const name = [data.customer.firstName, data.customer.lastName]
    .filter(Boolean)
    .join(" ") || "Shopify customer";
  const sessions = (data.customer.sessions?.references.nodes || [])
    .map(nodeToSession)
    .filter((session) => session.customerId === id)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const referenceIds = Array.isArray(data.customer.sessions?.jsonValue)
    ? (data.customer.sessions?.jsonValue as unknown[]).filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return { id, name, sessions, referenceIds };
}

export async function getAllSessions(admin: AdminGraphqlClient, limit = 250) {
  const sessions: MatchSessionRecord[] = [];
  let after: string | null = null;
  while (sessions.length < limit) {
    type SessionPageData = {
      metaobjects: {
        nodes: MetaobjectNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
    const data: SessionPageData = await graphqlJson<SessionPageData>(
      await admin.graphql(ALL_SESSIONS_QUERY, {
        variables: { first: Math.min(100, limit - sessions.length), after },
      }),
    );
    sessions.push(...data.metaobjects.nodes.map(nodeToSession));
    if (!data.metaobjects.pageInfo.hasNextPage) break;
    after = data.metaobjects.pageInfo.endCursor;
  }
  return sessions;
}

export async function getSessionByHandle(
  admin: AdminGraphqlClient,
  handle: string,
) {
  const data = await graphqlJson<{ metaobjectByHandle: MetaobjectNode | null }>(
    await admin.graphql(SESSION_BY_HANDLE_QUERY, {
      variables: { handle: { type: SESSION_TYPE, handle } },
    }),
  );
  return data.metaobjectByHandle ? nodeToSession(data.metaobjectByHandle) : null;
}

export function sessionHandle(id?: unknown) {
  const raw =
    typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,80}$/.test(id)
      ? id
      : randomUUID();
  return raw.startsWith("session-") ? raw : `session-${raw}`;
}

export async function saveSession(
  admin: AdminGraphqlClient,
  input: {
    id?: unknown;
    name?: unknown;
    status?: unknown;
    payload?: unknown;
  },
  customer: { id: string; name: string; referenceIds: string[] },
) {
  const handle = sessionHandle(input.id);
  const existing = await getSessionByHandle(admin, handle);
  if (existing && existing.customerId !== customer.id) {
    throw new Response("This session belongs to another customer.", { status: 403 });
  }

  const payload = sanitizePayload(input.payload);
  const chunks = splitPayload(payload);
  const name =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, 120)
      : `Matching session ${new Date().toLocaleDateString("en-ZA")}`;
  const status = ["In progress", "Ready", "Archived"].includes(String(input.status))
    ? String(input.status)
    : "In progress";
  const matchedCount = payload.rows.filter((row) => row.status === "matched").length;
  const reviewCount = payload.rows.filter((row) => row.status === "review").length;
  const ignoredCount = payload.rows.filter((row) => row.status === "ignored").length;
  const now = payload.savedAt;
  const createdAt = existing?.createdAt || now;
  const values = [
    ["name", name],
    ["customer_id", customer.id],
    ["customer_name", customer.name],
    ["source_file", payload.sourceFile || ""],
    ["status", status],
    ["row_count", String(payload.rows.length)],
    ["matched_count", String(matchedCount)],
    ["review_count", String(reviewCount)],
    ["ignored_count", String(ignoredCount)],
    ["matcher_version", String(payload.matcherVersion)],
    ["created_at", createdAt],
    ["saved_at", now],
    ["payload_1", chunks[0]],
    ["payload_2", chunks[1]],
    ["payload_3", chunks[2]],
    ["payload_4", chunks[3]],
  ].map(([key, value]) => ({ key, value }));

  const saved = await graphqlJson<{
    metaobjectUpsert: {
      metaobject: null | { id: string; handle: string; updatedAt: string };
      userErrors: Array<{ message: string }>;
    };
  }>(
    await admin.graphql(UPSERT_SESSION_MUTATION, {
      variables: {
        handle: { type: SESSION_TYPE, handle },
        metaobject: { fields: values },
      },
    }),
  );
  if (saved.metaobjectUpsert.userErrors.length || !saved.metaobjectUpsert.metaobject) {
    throw new Response(
      saved.metaobjectUpsert.userErrors.map((error) => error.message).join("; ") ||
        "The session could not be saved.",
      { status: 422 },
    );
  }

  const metaobject = saved.metaobjectUpsert.metaobject;
  const references = [
    metaobject.id,
    ...customer.referenceIds.filter((id) => id !== metaobject.id),
  ].slice(0, 100);
  const linked = await graphqlJson<{
    metafieldsSet: { userErrors: Array<{ message: string }> };
  }>(
    await admin.graphql(LINK_SESSION_MUTATION, {
      variables: { ownerId: customer.id, value: JSON.stringify(references) },
    }),
  );
  if (linked.metafieldsSet.userErrors.length) {
    throw new Response(
      linked.metafieldsSet.userErrors.map((error) => error.message).join("; "),
      { status: 422 },
    );
  }

  return {
    handle: metaobject.handle,
    id: metaobject.id,
    name,
    status,
    savedAt: now,
  };
}
