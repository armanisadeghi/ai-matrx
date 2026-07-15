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
import { ActiveContextButton } from "@/features/scopes/components/active-context/ActiveContextButton";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";

export default async function KnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; scope?: string; scopeType?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <KnowledgeGraphLanding />;

  const { org, scope, scopeType } = await searchParams;

  return (
    <>
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0">
          <h1 className="text-sm font-medium text-foreground truncate">
            Knowledge graph
          </h1>
          <div className="ml-auto shrink-0 flex items-center">
            {/* Working context — filtering today; direct scope↔node assignment
                is the next (and biggest) step for this surface. */}
            <ActiveContextButton
              size="sm"
              align="end"
              triggerClassName="max-w-[200px] sm:max-w-[360px]"
            />
          </div>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured">
        <KnowledgeGraphClient
          orgParam={org ?? null}
          scopeParam={scope ?? null}
          scopeTypeParam={scopeType ?? null}
        />
      </div>
    </>
  );
}
