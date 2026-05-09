"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// HeaderStructured — Variant 2
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  ≡  │  ‹  │       Title / ⌄ Dropdown ⌄       │  ⊕  ⟐  ⋯  │  ◉  │
// └─────────────────────────────────────────────────────────────────┘
//        opt              centered                     opt
//
// Usage:
//   <PageHeader>
//     <HeaderStructured
//       back
//       title="Inventory"
//       actions={[
//         { icon: "Plus",   label: "New Item",  onPress: handleNew },
//         { icon: "Filter", label: "Filter",    onPress: handleFilter },
//       ]}
//     />
//   </PageHeader>
//
//   <PageHeader>
//     <HeaderStructured
//       title="Select view"
//       dropdown={{
//         options: [
//           { label: "Grid",    value: "grid",    icon: "LayoutGrid" },
//           { label: "List",    value: "list",    icon: "List" },
//           { label: "Kanban",  value: "kanban",  icon: "Columns3" },
//         ],
//         selected: currentView,
//         onSelect: setCurrentView,
//       }}
//     />
//   </PageHeader>

import { useState } from "react";
import HeaderBack from "../shared/HeaderBack";
import HeaderActions from "../shared/HeaderActions";
import GlassDropdown from "../shared/GlassDropdown";
import LucideIcon from "../shared/LucideIcon";
import type { HeaderAction, HeaderDropdownOption } from "../types";

interface DropdownConfig<T extends string = string> {
  options: HeaderDropdownOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

interface HeaderStructuredProps<T extends string = string> {
  /** Show back chevron. Pass true (uses history.back) or a handler function. */
  back?: boolean | (() => void);
  /** Static title text — ignored if dropdown is provided */
  title?: string;
  /** Replaces the title with a tappable dropdown */
  dropdown?: DropdownConfig<T>;
  /** Right-side actions — auto glass icons on desktop, bottom sheet on mobile */
  actions?: HeaderAction[];
  /** Max inline action icons on desktop before overflow. Default: 3 */
  maxInlineActions?: number;
}

export default function HeaderStructured<T extends string = string>({
  back,
  title,
  dropdown,
  actions = [],
  maxInlineActions,
}: HeaderStructuredProps<T>) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const backHandler = typeof back === "function" ? back : undefined;

  // Find the currently selected dropdown label
  const selectedOption = dropdown?.options.find((o) => o.value === dropdown.selected);

  return (
    <div className="hdr-structured">
      {/* ─── Left: Back — pinned to left edge ─── */}
      {back && (
        <div className="hdr-back-slot">
          <HeaderBack onClick={backHandler} />
        </div>
      )}

      {/* ─── Center: Title or Dropdown — truly centered ─── */}
      <div className="hdr-structured-center">
        {dropdown ? (
          <div className="hdr-structured-dropdown-anchor">
            <button
              className="hdr-structured-dropdown-trigger matrx-shell-glass shell-tactile-subtle"
              onClick={() => setDropdownOpen((v) => !v)}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
            >
              {selectedOption?.icon && (
                <LucideIcon name={selectedOption.icon} size={14} className="hdr-structured-dropdown-icon" />
              )}
              <span className="hdr-structured-dropdown-label">
                {selectedOption?.label ?? title ?? "Select"}
              </span>
              <LucideIcon
                name="ChevronDown"
                size={13}
                className={`hdr-structured-dropdown-chevron ${dropdownOpen ? "hdr-chevron-flipped" : ""}`}
              />
            </button>
            <GlassDropdown
              mode="select"
              options={dropdown.options}
              onSelect={(val) => {
                dropdown.onSelect(val);
                setDropdownOpen(false);
              }}
              open={dropdownOpen}
              onClose={() => setDropdownOpen(false)}
              align="center"
            />
          </div>
        ) : title ? (
          <span className="hdr-structured-title">{title}</span>
        ) : null}
      </div>

      {/* ─── Right: Actions — pinned to right edge ─── */}
      {actions.length > 0 && (
        <div className="hdr-actions-slot">
          <HeaderActions actions={actions} maxInline={maxInlineActions} />
        </div>
      )}
    </div>
  );
}
