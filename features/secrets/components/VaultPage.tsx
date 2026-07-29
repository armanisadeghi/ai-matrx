"use client";

/**
 * Vault route body. `(core)` body contract: `h-full overflow-hidden` with the
 * scroll container inside — never a viewport-height calc, since `.shell-main`
 * is already full height (features/shell/components/header/variants/USAGE.md).
 *
 * Deliberately thin: it mounts the ONE `VaultWorkspace` the settings and
 * organization surfaces also render.
 */
import { VaultWorkspace } from "./VaultWorkspace";

export function VaultPage() {
  return (
    <div className="h-full overflow-hidden">
      <div className="h-full min-h-0 pt-[var(--shell-header-h)]">
        <VaultWorkspace principal={{ type: "user" }} presentation="full" />
      </div>
    </div>
  );
}
