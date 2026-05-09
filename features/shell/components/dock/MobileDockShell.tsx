// MobileDockShell — Server-renderable dock container.
//
// Owns all structure: CSS classes, glass effect, positioning, aria-label.
// Active state is driven entirely by CSS reading data-pathname on .shell-root
// (set server-side in layout.tsx, kept live by NavActiveSync).
// This component has zero knowledge of routing.
//
// Usage (default):
//   <MobileDockShell>
//     <MobileDockItems />
//   </MobileDockShell>
//
// Usage (custom route dock — identical shell, different items):
//   <MobileDockShell label="Note actions">
//     <MyRouteDockItems />
//   </MobileDockShell>

import type { ReactNode } from "react";

interface MobileDockShellProps {
  children: ReactNode;
  /** Accessible label for the nav landmark. Defaults to "Quick navigation". */
  label?: string;
}

export default function MobileDockShell({
  children,
  label = "Quick navigation",
}: MobileDockShellProps) {
  return (
    <nav className="shell-dock matrx-glass-core" aria-label={label}>
      {children}
    </nav>
  );
}
