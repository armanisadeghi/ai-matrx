// app/(core)/knowledge/graph/page.tsx
//
// Org-wide knowledge graph workspace. Guests get the marketing landing
// server-side — the KgGraphCanvas reads from authed-only Redux state
// (`useActiveContext`) and would crash on a stub guest user.
//
// URL params (`?org=`, `?scope=`, `?scopeType=`) deep-link a filtered
// graph for the org workspace; they pass through to `KnowledgeGraphClient`.

import { KnowledgeGraphClient } from "./KnowledgeGraphClient";
import KnowledgeGraphLanding from "@/features/auth/components/module-landing/landings/KnowledgeGraphLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";


export default async function KnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; scope?: string; scopeType?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <KnowledgeGraphLanding />;

  const { org, scope, scopeType } = await searchParams;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <h1 className="text-lg font-semibold text-foreground">
          Knowledge graph
        </h1>
        <p className="text-xs text-muted-foreground">
          Entities and relationships across your organization&apos;s content.
          Click a node to inspect its source mentions.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <KnowledgeGraphClient
          orgParam={org ?? null}
          scopeParam={scope ?? null}
          scopeTypeParam={scopeType ?? null}
        />
      </div>
    </div>
  );
}
