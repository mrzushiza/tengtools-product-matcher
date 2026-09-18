import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAllSessions } from "../lib/match-sessions.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const sessions = await getAllSessions(admin, 250);
  return { sessions };
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SessionsIndex() {
  const { sessions } = useLoaderData<typeof loader>();
  const active = sessions.filter((session) => session.status !== "Archived");
  const needingReview = active.filter((session) => session.reviewCount > 0).length;

  return (
    <s-page heading="Product matcher sessions" inlineSize="large">
      <s-section>
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">Active sessions</s-text>
            <s-heading>{active.length}</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">Need review</s-text>
            <s-heading>{needingReview}</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">Saved customers</s-text>
            <s-heading>{new Set(active.map((session) => session.customerId)).size}</s-heading>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Recent sessions">
        {sessions.length ? (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Session</s-table-header>
              <s-table-header listSlot="labeled">Customer</s-table-header>
              <s-table-header listSlot="labeled">Progress</s-table-header>
              <s-table-header listSlot="labeled">Last saved</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {sessions.map((session) => (
                <s-table-row key={session.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      <s-link href={`/app/sessions/${session.handle}`}>{session.name}</s-link>
                      <s-badge tone={session.reviewCount ? "warning" : "success"}>
                        {session.status}
                      </s-badge>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{session.customerName}</s-table-cell>
                  <s-table-cell>
                    {session.matchedCount} matched · {session.reviewCount} review · {session.rowCount} rows
                  </s-table-cell>
                  <s-table-cell>{shortDate(session.savedAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-box padding="large" background="subdued" borderRadius="base">
            <s-heading>No saved sessions yet</s-heading>
            <s-paragraph>
              A session appears here as soon as a signed-in customer saves their matcher review.
            </s-paragraph>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
