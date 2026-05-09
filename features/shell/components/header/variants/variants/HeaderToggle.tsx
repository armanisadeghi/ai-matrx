"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// HeaderToggle — Variant 3
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  ≡  │  ‹  │  ┌────────┬────────┐  │  ⋯  │  ◉  │
// │     │     │  │▓▓ Notes │ Folders│  │     │     │
// │     │     │  └────────┴────────┘  │     │     │
// └─────────────────────────────────────────────────────────────────┘
//
// Usage:
//   <PageHeader>
//     <HeaderToggle
//       back
//       options={[
//         { icon: "StickyNote", label: "Notes",   value: "notes" },
//         { icon: "Folder",     label: "Folders", value: "folders" },
//       ]}
//       active="notes"
//       onChange={setView}
//       actions={[{ icon: "Search", label: "Search", onPress: handleSearch }]}
//     />
//   </PageHeader>

import HeaderBack from "../shared/HeaderBack";
import HeaderActions from "../shared/HeaderActions";
import LucideIcon from "../shared/LucideIcon";
import type { HeaderAction, HeaderOption } from "../types";

interface HeaderToggleProps<T extends string = string> {
  /** Show back chevron */
  back?: boolean | (() => void);
  /** Exactly 2 options */
  options: [HeaderOption<T>, HeaderOption<T>];
  /** Currently active value */
  active: T;
  /** Toggle change handler */
  onChange: (value: T) => void;
  /** Right-side actions */
  actions?: HeaderAction[];
}

export default function HeaderToggle<T extends string = string>({
  back,
  options,
  active,
  onChange,
  actions = [],
}: HeaderToggleProps<T>) {
  const backHandler = typeof back === "function" ? back : undefined;

  return (
    <div className="hdr-toggle-root">
      {/* ─── Left: Back — pinned to left edge ─── */}
      {back && (
        <div className="hdr-back-slot">
          <HeaderBack onClick={backHandler} />
        </div>
      )}

      {/* ─── Center: Toggle — flex:1, content centered within ─── */}
      <div className="hdr-structured-center">
      <div className="hdr-toggle-track matrx-glass-thin-border">
        {options.map((option) => {
          const isActive = option.value === active;
          return (
            <button
              key={option.value}
              className={`hdr-toggle-thumb ${isActive ? "hdr-toggle-thumb-active" : ""}`}
              onClick={() => onChange(option.value)}
              type="button"
              role="tab"
              aria-selected={isActive}
            >
              {option.icon && (
                <LucideIcon
                  name={option.icon}
                  size={14}
                  className="hdr-toggle-icon"
                />
              )}
              <span className="hdr-toggle-label">{option.label}</span>
            </button>
          );
        })}
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
