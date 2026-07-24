"use client";

// features/admin/relationships/components/RelationshipSharingClient.tsx
//
// Sharing tab of the Relationships hub — the ONE home for
// platform.shareable_resource_registry: full row CRUD (ShareableRegistryPanel)
// plus the link-policy levers (no-login link sharing + public-columns
// allowlist) absorbed from the retired /administration/sharing page.
//
// The Overview drift panel deep-links here with ?register=<token>
// (consume-once: applied then stripped with router.replace).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Link2, ShieldCheck } from "lucide-react";

import { ShareableRegistryPanel } from "./ShareableRegistryPanel";
import type { SharePolicyRow, ShareableRegistryRow } from "../types";

interface Props {
  registry: ShareableRegistryRow[];
  policies: SharePolicyRow[];
  /** ?register=<token> from the Overview drift panel; consume-once. */
  initialRegisterToken?: string;
}

export function RelationshipSharingClient({
  registry,
  policies,
  initialRegisterToken,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // Consume-once deep link: feed the token into the registry panel (which
  // opens the pre-filled create/edit form), then strip the param so
  // refresh/back doesn't re-trigger it.
  const consumedToken = useRef(false);
  useEffect(() => {
    if (!initialRegisterToken || consumedToken.current) return;
    consumedToken.current = true;
    setPendingToken(initialRegisterToken);
    router.replace("/administration/database/relationships/sharing");
  }, [initialRegisterToken, router]);

  const shareableCount = policies.filter((p) => p.is_link_shareable).length;
  const publicCapableCount = policies.filter((p) => p.supports_public).length;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Columns3 className="h-4 w-4" /> {registry.length} types
        </span>
        <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
          <Link2 className="h-4 w-4" /> {shareableCount} link-shareable
        </span>
        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4" /> {publicCapableCount}{" "}
          public-capable
        </span>
      </div>

      <ShareableRegistryPanel
        registry={registry}
        policies={policies}
        pendingToken={pendingToken}
        onPendingTokenConsumed={() => setPendingToken(null)}
        onMutated={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
