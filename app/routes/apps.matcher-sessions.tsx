import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { analyzeToolMatches } from "../lib/ai-matcher.server";
import {
  customerGid,
  getCustomerSessions,
  getSessionByHandle,
  saveSession,
} from "../lib/match-sessions.server";

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function customerIdFromRequest(request: Request) {
  return new URL(request.url).searchParams.get("logged_in_customer_id") || "";
}

async function contextForRequest(request: Request) {
  const context = await authenticate.public.appProxy(request);
  if (!context.admin || !context.session) {
    throw new Response("The Product Matcher Sessions app is not installed.", {
      status: 503,
    });
  }
  return context;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await contextForRequest(request);
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";
  const customerId = customerIdFromRequest(request);
  const handle = url.searchParams.get("id") || "";
  if (action === "load") {
    if (!handle) return json({ error: "A session ID is required." }, { status: 400 });
    const record = await getSessionByHandle(admin, handle);
    if (!record) return json({ error: "Session not found." }, { status: 404 });
    if (!customerId || record.customerId !== customerGid(customerId)) {
      return json({ error: "You do not have access to this session." }, { status: 403 });
    }
    return json({ session: record });
  }

  if (!customerId) {
    return json({ error: "Sign in to view saved sessions." }, { status: 401 });
  }
  const customer = await getCustomerSessions(admin, customerId);
  return json({ sessions: customer.sessions, customerName: customer.name });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await contextForRequest(request);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "JSON is required." }, { status: 415 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  if (body.action === "analyze") {
    const customerId = customerIdFromRequest(request);
    if (!customerId) {
      return json({ error: "Sign in to use enhanced matching." }, { status: 401 });
    }
    try {
      const matches = await analyzeToolMatches(body.items, request.signal);
      return json({ matches });
    } catch (error) {
      if (error instanceof Response) {
        return json({ error: await error.text() }, { status: error.status });
      }
      return json({ error: "Enhanced matching failed." }, { status: 502 });
    }
  }
  if (body.action !== "save") {
    return json({ error: "Unsupported action." }, { status: 400 });
  }
  const input =
    body.session && typeof body.session === "object"
      ? (body.session as Record<string, unknown>)
      : {};
  const customerId = customerIdFromRequest(request);

  if (!customerId) {
    return json({ error: "Sign in to save a matching session." }, { status: 401 });
  }
  const customer = await getCustomerSessions(admin, customerId);
  const result = await saveSession(admin, input, {
    id: customer.id,
    name: customer.name,
    referenceIds: customer.referenceIds,
  });
  return json({ session: result });
};
