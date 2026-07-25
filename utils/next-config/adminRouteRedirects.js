/**
 * Legacy-to-canonical redirects for the 2026 administration route nesting.
 *
 * Keep the more-specific families first: Next.js uses the first matching
 * redirect, so Relationships › Actions and Agent Drift must win before their
 * former parent families.
 */

const ADMIN_ROUTE_FAMILY_MOVES = [
    ["/administration/relationships/actions", "/administration/agents/relationships/actions"],
    ["/administration/reports/agent-drift", "/administration/agents/reports/agent-drift"],
    ["/administration/ai-models", "/administration/ai/ai-models"],
    ["/administration/ai-tasks", "/administration/ai/ai-tasks"],
    ["/administration/system-agents", "/administration/agents/system-agents"],
    ["/administration/agent-apps", "/administration/agents/agent-apps"],
    ["/administration/skills", "/administration/agents/skills"],
    ["/administration/mcp-tools", "/administration/agents/mcp-tools"],
    ["/administration/mcp-servers", "/administration/agents/mcp-servers"],
    ["/administration/bundles", "/administration/agents/bundles"],
    ["/administration/executor-surfaces", "/administration/agents/executor-surfaces"],
    ["/administration/lookups", "/administration/agents/lookups"],
    ["/administration/cx-dashboard", "/administration/chat/cx-dashboard"],
    ["/administration/kg-cost", "/administration/knowledge/kg-cost"],
    ["/administration/kg-inspector", "/administration/knowledge/kg-inspector"],
    ["/administration/research-system", "/administration/knowledge/research-system"],
    ["/administration/podcasts", "/administration/knowledge/podcasts"],
    ["/administration/cms-agents", "/administration/knowledge/cms-agents"],
    ["/administration/system-context", "/administration/scopes-context/system-context"],
    ["/administration/context-inspector", "/administration/scopes-context/context-inspector"],
    ["/administration/database-admin", "/administration/database/database-admin"],
    ["/administration/relationships", "/administration/database/relationships"],
    ["/administration/canonicalization", "/administration/database/canonicalization"],
    ["/administration/schema-visualizer-enhanced", "/administration/database/schema-visualizer-enhanced"],
    ["/administration/schema-visualizer", "/administration/database/schema-visualizer"],
    ["/administration/data-integrity", "/administration/database/data-integrity"],
    ["/administration/surfaces", "/administration/ui/surfaces"],
    ["/administration/official-components", "/administration/ui/official-components"],
    ["/administration/experimental-routes", "/administration/ui/experimental-routes"],
    ["/administration/persistence-test", "/administration/ui/persistence-test"],
    ["/administration/scheduling", "/administration/automation/scheduling"],
    ["/administration/feedback", "/administration/users/feedback"],
    ["/administration/agent-review", "/administration/users/agent-review"],
    ["/administration/sandbox-infra", "/administration/compute/sandbox-infra"],
    ["/administration/sandbox", "/administration/compute/sandbox"],
    ["/administration/server-logs", "/administration/compute/server-logs"],
    ["/administration/resilience-lab", "/administration/compute/resilience-lab"],
    ["/administration/content-blocks", "/administration/utilities/content-blocks"],
    ["/administration/content-templates", "/administration/utilities/content-templates"],
    ["/administration/markdown-tester", "/administration/utilities/markdown-tester"],
    ["/administration/kind-registry", "/administration/utilities/kind-registry"],
    ["/administration/local-storage", "/administration/utilities/local-storage"],
    ["/administration/blob-cache", "/administration/utilities/blob-cache"],
    ["/administration/all-routes", "/administration/utilities/all-routes"],
    ["/administration/capture-inspector", "/administration/utilities/capture-inspector"],
    ["/administration/server-cache", "/administration/utilities/server-cache"],
    // Retired 2026-07-25 (D103): in-app TS analyzer OOM'd production builds.
    // CLI replacement: `pnpm capture-errors`. Old bookmarks land on the utilities hub.
    ["/administration/typescript-errors", "/administration/utilities"],
    ["/administration/utilities/typescript-errors", "/administration/utilities"],
    ["/administration/utils", "/administration/utilities/utils"],
    ["/administration/feature-docs", "/administration/documentation/feature-docs"],
    ["/administration/reports", "/administration/reporting/reports"],
    ["/administration/events", "/administration/reporting/events"],
];

function routeFamilyRedirects([source, destination]) {
    return [
        { source, destination, permanent: true },
        {
            source: `${source}/:path*`,
            destination: `${destination}/:path*`,
            permanent: true,
        },
    ];
}

const adminLegacyRouteRedirects = [
    ...ADMIN_ROUTE_FAMILY_MOVES.flatMap(routeFamilyRedirects),
];

module.exports = { adminLegacyRouteRedirects };
