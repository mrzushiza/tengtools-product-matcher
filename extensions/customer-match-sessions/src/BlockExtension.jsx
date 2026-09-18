import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useMemo, useState} from "preact/hooks";

const CUSTOMER_SESSIONS_QUERY = `#graphql
  query CustomerMatcherSessions($id: ID!) {
    customer(id: $id) {
      sessions: metafield(key: "match_sessions") {
        references(first: 20) {
          nodes {
            ... on Metaobject {
              id
              handle
              updatedAt
              fields {
                key
                value
              }
            }
          }
        }
      }
    }
  }
`;

export default async () => {
  render(<Extension />, document.body);
};

function fieldsByKey(fields) {
  return Object.fromEntries(
    (fields || []).map((field) => [field.key, field.value || ""]),
  );
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sessionFromNode(node) {
  const fields = fieldsByKey(node.fields);
  return {
    id: node.id,
    handle: node.handle,
    name: fields.name || "Untitled session",
    status: fields.status || "In progress",
    rowCount: numberValue(fields.row_count),
    matchedCount: numberValue(fields.matched_count),
    reviewCount: numberValue(fields.review_count),
    savedAt: fields.saved_at || node.updatedAt,
  };
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Extension() {
  const customerId = shopify.data.selected?.[0]?.id;
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSessions() {
      if (!customerId) {
        setError("This customer could not be identified.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("shopify:admin/api/graphql.json", {
          method: "POST",
          body: JSON.stringify({
            query: CUSTOMER_SESSIONS_QUERY,
            variables: {id: customerId},
          }),
        });
        const result = await response.json();
        if (!response.ok || result.errors?.length) {
          throw new Error(result.errors?.[0]?.message || "Shopify returned an error.");
        }

        const records = (result.data?.customer?.sessions?.references?.nodes || [])
          .map(sessionFromNode)
          .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
        if (active) setSessions(records);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Sessions could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSessions();
    return () => {
      active = false;
    };
  }, [customerId]);

  const reviewCount = useMemo(
    () => sessions.reduce((total, session) => total + session.reviewCount, 0),
    [sessions],
  );

  return (
    <s-admin-block
      heading="Product matcher sessions"
      collapsedSummary={
        loading
          ? "Loading sessions"
          : `${sessions.length} saved · ${reviewCount} rows need review`
      }
    >
      {loading ? (
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-spinner accessibilityLabel="Loading matching sessions" size="base" />
          <s-text>Loading matching sessions</s-text>
        </s-stack>
      ) : error ? (
        <s-banner heading="Sessions could not be loaded" tone="critical">
          {error}
        </s-banner>
      ) : sessions.length ? (
        <s-stack direction="block" gap="base">
          {sessions.slice(0, 5).map((session) => (
            <s-box key={session.id} paddingBlock="small-200">
              <s-stack direction="block" gap="small-200">
                <s-stack direction="inline" gap="base" justifyContent="space-between">
                  <s-link href={`/app/sessions/${session.handle}`}>{session.name}</s-link>
                  <s-badge tone={session.reviewCount ? "warning" : "success"}>
                    {session.reviewCount ? "Needs review" : session.status}
                  </s-badge>
                </s-stack>
                <s-text color="subdued">
                  {session.matchedCount} matched · {session.reviewCount} review · {session.rowCount} rows
                </s-text>
                <s-text color="subdued">Saved {formatDate(session.savedAt)}</s-text>
              </s-stack>
            </s-box>
          ))}
          <s-link href="/app">View all matching sessions</s-link>
        </s-stack>
      ) : (
        <s-stack direction="block" gap="small-200">
          <s-text>No matching sessions have been saved for this customer yet.</s-text>
          <s-link href="/app">Open Product matcher sessions</s-link>
        </s-stack>
      )}
    </s-admin-block>
  );
}
