import { ShieldCheck } from "lucide-react";

import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";
import { VaultWorkspace } from "@/features/secrets/components/VaultWorkspace";

/**
 * Sharp settings presentation for the canonical credential Vault.
 *
 * This route deliberately composes the one shared VaultWorkspace rather than
 * creating a second credential UI. That preserves its real data, capability
 * checks, reveal lifecycle, create/import flows, and credential detail tools.
 */
export default function SecretsSharpPage() {
  return (
    <>
      <PageSpecificHeader>
        <div className="flex h-full min-w-0 items-center gap-2 px-1">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-foreground">
            Credentials
          </span>
        </div>
      </PageSpecificHeader>

      <main className="h-full min-h-0 overflow-hidden bg-textured">
        <VaultWorkspace principal={{ type: "user" }} presentation="full" />
      </main>
    </>
  );
}
