import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getSessionByHandle } from "../lib/match-sessions.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const record = await getSessionByHandle(admin, params.handle || "");
  if (!record) throw new Response("Session not found.", { status: 404 });
  return { record };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SessionDetails() {
  const { record } = useLoaderData<typeof loader>();
  return (
    <s-page heading={record.name} inlineSize="large">
      <s-button slot="secondary-actions" href="/app">Back to sessions</s-button>

      <s-section heading="Customer and progress">
        <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">Customer</s-text>
            <s-heading>{record.customerName}</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">Last saved</s-text>
            <s-heading>{formatDate(record.savedAt)}</s-heading>
          </s-box>
        </s-grid>
        <s-stack direction="inline" gap="base">
          <s-badge tone="success">{record.matchedCount} matched</s-badge>
          <s-badge tone={record.reviewCount ? "warning" : "success"}>
            {record.reviewCount} need review
          </s-badge>
          <s-badge>{record.ignoredCount} ignored</s-badge>
          <s-badge>{record.rowCount} total rows</s-badge>
        </s-stack>
      </s-section>

      <s-section heading="Matching rows">
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header listSlot="primary">Requested item</s-table-header>
            <s-table-header listSlot="labeled">Status</s-table-header>
            <s-table-header listSlot="labeled">Teng match</s-table-header>
            <s-table-header listSlot="labeled">Teng ID</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {record.payload.rows.map((row, index) => (
              <s-table-row key={String(row.row ?? index)}>
                <s-table-cell>{String(row.inputTitle || row.inputId || "N/A")}</s-table-cell>
                <s-table-cell>
                  <s-badge
                    tone={
                      row.status === "matched"
                        ? "success"
                        : row.status === "ignored"
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {String(row.status || "review")}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>{String(row.tengTitle || "No match selected")}</s-table-cell>
                <s-table-cell>{String(row.tengSku || "N/A")}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
