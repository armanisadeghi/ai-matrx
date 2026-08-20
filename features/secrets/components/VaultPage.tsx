"use client";

/**
 * Vault route body. `(core)` body contract: `h-full overflow-hidden` with the
 * scroll container inside — never a viewport-height calc, since `.shell-main`
 * is already full height (features/shell/components/header/variants/USAGE.md).
 *
 * Deliberately thin: it mounts the ONE `VaultWorkspace` the settings and
 * organization surfaces also render.
 *
 * `?item=<id>` opens that credential directly (THE DOOR LAW — a surface that
 * names a credential must be able to reach it; the Authenticator's "View
 * credential in Vault" link is the first consumer). The param is the initial
 * position only: selecting something else updates the URL so the view stays
 * linkable, and closing the detail clears it.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { VaultWorkspace } from "./VaultWorkspace";

export function VaultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams.get("item"),
  );

  const onSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set("item", id);
      else next.delete("item");
      const query = next.toString();
      router.replace(query ? `/vault?${query}` : "/vault", { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full min-h-0 pt-[var(--shell-header-h)]">
        <VaultWorkspace
          principal={{ type: "user" }}
          presentation="full"
          selectedItemId={selectedId}
          onSelectedItemIdChange={onSelect}
        />
      </div>
    </div>
  );
}
