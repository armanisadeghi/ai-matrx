"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// HeaderPills — Variant 5
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  ≡  │ (▓All▓) ( Msgs ) ( Tasks ) ( Files ) │  ◉  │
// └─────────────────────────────────────────────────────────────────┘
//
// Four pill buttons distributed across the flexible zone.
// No back or actions — pills fill the space.
//
// Usage:
//   <PageHeader>
//     <HeaderPills
//       options={[
//         { icon: "Layers",     label: "All",    value: "all", badge: 12 },
//         { icon: "MessageCircle", label: "Msgs",   value: "msgs" },
//         { icon: "SquareCheck",   label: "Tasks",  value: "tasks", badge: 3 },
//         { icon: "File",          label: "Files",  value: "files" },
//       ]}
//       active="all"
//       onChange={setCategory}
//     />
//   </PageHeader>

import LucideIcon from "../shared/LucideIcon";
import type { HeaderOption } from "../types";

interface HeaderPillsProps<T extends string = string> {
  /** Exactly 4 options */
  options: [HeaderOption<T>, HeaderOption<T>, HeaderOption<T>, HeaderOption<T>];
  /** Currently active value */
  active: T;
  /** Change handler */
  onChange: (value: T) => void;
}

export default function HeaderPills<T extends string = string>({
  options,
  active,
  onChange,
}: HeaderPillsProps<T>) {
  return (
    <div className="hdr-pills-track">
      {options.map((option) => {
        const isActive = option.value === active;
        return (
          <button
            key={option.value}
            className={`hdr-pill ${isActive ? "hdr-pill-active matrx-shell-glass" : ""} shell-tactile-subtle`}
            onClick={() => onChange(option.value)}
            type="button"
            role="tab"
            aria-selected={isActive}
          >
            {option.icon && (
              <LucideIcon name={option.icon} size={14} className="hdr-pill-icon" />
            )}
            <span className="hdr-pill-label">{option.label}</span>
            {option.badge != null && option.badge > 0 && (
              <span className={`hdr-pill-badge ${isActive ? "hdr-pill-badge-active" : ""}`}>
                {option.badge > 99 ? "99+" : option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
