"use client";

// features/admin/shared-knowledge/components/SharedKnowledgeAdminClient.tsx
//
// Client shell for /administration/shared-knowledge — the super-admin
// issuance cockpit for Shared Knowledge Resources. Four tabs:
//   Industries      — taxonomy CRUD (industry_upsert) + org assign/unassign
//   Stores & grants — every kind='library' store; publish/revoke all three
//                     audiences via the grant RPC family
//   Starter packs   — SEO industry starter packs ARE Library resources: author,
//                     propose from sample sites, ratify, version, publish
//                     through the same platform.entity_grants spine
//   Ingest          — curation ingest through the canonical fileHandler +
//                     P1's /knowledge/library/stores/{id}/ingest endpoint
//   Access explorer — "who can read what, and why" over grants + industry
//                     assignments + memberships
//
// Directory data (orgs, memberships, all library stores) is server-loaded;
// everything else reads/writes direct-to-Supabase via existing RPCs.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, FileUp, Layers, Library, Package, SearchCheck } from "lucide-react";
import type { SharedKnowledgeDirectory } from "../types";
import { IndustriesTab } from "./IndustriesTab";
import { StoresGrantsTab } from "./StoresGrantsTab";
import { IngestTab } from "./IngestTab";
import { AccessExplorerTab } from "./AccessExplorerTab";
import { StarterPacksTab } from "../packs/StarterPacksTab";

export function SharedKnowledgeAdminClient({
  directory,
}: {
  directory: SharedKnowledgeDirectory;
}) {
  // `?tab=packs` (and `?pack=<id>`, read by the packs tab) are the console's own
  // deep links — the Access explorer and the review queue point at them.
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(
    initialTab && ["industries", "stores", "packs", "ingest", "explorer"].includes(initialTab)
      ? initialTab
      : "industries",
  );

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden px-4 pt-3">
      <div className="mb-2 flex items-center gap-2">
        <Library className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-base font-semibold leading-tight text-foreground">
            Shared Knowledge
          </h1>
          <p className="text-xs text-muted-foreground">
            Industry taxonomy, library stores, starter packs, grant issuance, and
            access provenance
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Mobile: taller triggers (finger-size targets) + horizontal scroll
            so all four tabs stay reachable on narrow screens. */}
        <TabsList className="h-auto w-fit max-w-full overflow-x-auto">
          <TabsTrigger value="industries" className="px-3 py-2.5 sm:py-1.5">
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Industries
          </TabsTrigger>
          <TabsTrigger value="stores" className="px-3 py-2.5 sm:py-1.5">
            <Building2 className="mr-1.5 h-3.5 w-3.5" /> Stores & grants
          </TabsTrigger>
          <TabsTrigger value="packs" className="px-3 py-2.5 sm:py-1.5">
            <Package className="mr-1.5 h-3.5 w-3.5" /> Starter packs
          </TabsTrigger>
          <TabsTrigger value="ingest" className="px-3 py-2.5 sm:py-1.5">
            <FileUp className="mr-1.5 h-3.5 w-3.5" /> Ingest
          </TabsTrigger>
          <TabsTrigger value="explorer" className="px-3 py-2.5 sm:py-1.5">
            <SearchCheck className="mr-1.5 h-3.5 w-3.5" /> Access explorer
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="industries"
          className="min-h-0 flex-1 overflow-y-auto pb-6 pt-3"
        >
          <IndustriesTab directory={directory} />
        </TabsContent>
        <TabsContent
          value="stores"
          className="min-h-0 flex-1 overflow-y-auto pb-6 pt-3"
        >
          <StoresGrantsTab directory={directory} />
        </TabsContent>
        <TabsContent
          value="packs"
          className="flex min-h-0 flex-1 flex-col overflow-hidden pb-2 pt-3"
        >
          <StarterPacksTab directory={directory} />
        </TabsContent>
        <TabsContent
          value="ingest"
          className="min-h-0 flex-1 overflow-y-auto pb-6 pt-3"
        >
          <IngestTab directory={directory} />
        </TabsContent>
        <TabsContent
          value="explorer"
          className="min-h-0 flex-1 overflow-y-auto pb-6 pt-3"
        >
          <AccessExplorerTab directory={directory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
