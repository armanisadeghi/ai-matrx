"use client";

/**
 * Vault route body. `(core)` body contract: `h-full overflow-hidden` with the
 * scroll container inside — never a viewport-height calc, since `.shell-main`
 * is already full height (features/shell/components/header/variants/USAGE.md).
 *
 * Deliberately thin: it mounts the ONE `VaultWorkspace` the settings and
 * organization surfaces also render.
 *
 * `/vault/[itemId]` is the canonical credential door (THE DOOR LAW — a surface
 * that names a credential must be able to reach it). Selection is route state,
 * never a query parameter or a private local draft.
 */
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { VaultWorkspace } from "./VaultWorkspace";

export function VaultPage({ itemId = null }: { itemId?: string | null }) {
  const router = useRouter();

  const onSelect = useCallback(
    (id: string | null) => {
      router.push(id ? `/vault/${encodeURIComponent(id)}` : "/vault", {
        scroll: false,
      });
    },
    [router],
  );

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full min-h-0 pt-[var(--shell-header-h)]">
        <VaultWorkspace
          principal={{ type: "user" }}
          presentation="full"
          selectedItemId={itemId}
          onSelectedItemIdChange={onSelect}
        />
      </div>
    </div>
  );
}
