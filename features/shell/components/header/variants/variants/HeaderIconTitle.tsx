"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// HeaderIconTitle — Variant 4
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  ≡  │  ‹  │         ✦ Page Title          │  ⋯  │  ◉  │
// └─────────────────────────────────────────────────────────────────┘
//
// A single icon + title lockup centered in a glass pill. Clean, branded feel.
//
// Usage:
//   <PageHeader>
//     <HeaderIconTitle
//       icon="LayoutDashboard"
//       title="Dashboard"
//     />
//   </PageHeader>
//
//   <PageHeader>
//     <HeaderIconTitle
//       back
//       icon="Settings"
//       title="Settings"
//       actions={[{ icon: "RotateCcw", label: "Reset", onPress: handleReset }]}
//     />
//   </PageHeader>

import HeaderBack from "../shared/HeaderBack";
import HeaderActions from "../shared/HeaderActions";
import LucideIcon from "../shared/LucideIcon";
import type { HeaderAction } from "../types";

interface HeaderIconTitleProps {
  /** Show back chevron */
  back?: boolean | (() => void);
  /** Lucide icon name for the lockup */
  icon: string;
  /** Title text */
  title: string;
  /** Right-side actions */
  actions?: HeaderAction[];
  /** Custom icon color class (applied to the icon only) */
  iconClassName?: string;
}

export default function HeaderIconTitle({
  back,
  icon,
  title,
  actions = [],
  iconClassName,
}: HeaderIconTitleProps) {
  const backHandler = typeof back === "function" ? back : undefined;

  return (
    <div className="hdr-icontitle-root">
      {/* ─── Left: Back — pinned to left edge ─── */}
      {back && (
        <div className="hdr-back-slot">
          <HeaderBack onClick={backHandler} />
        </div>
      )}

      {/* ─── Center: Icon + Title lockup — flex:1, content centered within ─── */}
      <div className="hdr-structured-center">
        <div className="hdr-icontitle-lockup matrx-shell-glass">
          <LucideIcon
            name={icon}
            size={15}
            className={`hdr-icontitle-icon ${iconClassName ?? ""}`}
            strokeWidth={2.2}
          />
          <span className="hdr-icontitle-label">{title}</span>
        </div>
      </div>

      {/* ─── Right: Actions — pinned to right edge ─── */}
      {actions.length > 0 && (
        <div className="hdr-actions-slot">
          <HeaderActions actions={actions} />
        </div>
      )}
    </div>
  );
}
