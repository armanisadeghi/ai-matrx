// app/(core)/knowledge/graph/page.tsx
//
// Org-wide knowledge graph workspace. Guests get the marketing landing
// server-side — the KgGraphCanvas reads from authed-only Redux state
// (`useActiveContext`) and would crash on a stub guest user.
//
// URL params (`?org_filter=`, `?scope=`, `?scopeType=`) deep-link a filtered
// graph for the org workspace; they pass through to `KnowledgeGraphClient`.

import { KnowledgeGraphClient } from "./KnowledgeGraphClient";
import KnowledgeGraphLanding from "@/features/auth/components/module-landing/landings/KnowledgeGraphLanding";
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export default async function KnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<{
    org_filter?: string;
    org?: string;
    scope?: string;
    scopeType?: string;
  }>;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeGraphLanding />;

  const { org_filter, org, scope, scopeType } = await searchParams;

  return (
    <>
      <RecordPageHeader record={{ name: "Knowledge graph" }} />
      <div
        className="h-full overflow-hidden bg-textured"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <KnowledgeGraphClient
          orgParam={org_filter ?? org ?? null}
          scopeParam={scope ?? null}
          scopeTypeParam={scopeType ?? null}
        />
      </div>
    </>
  );
}
