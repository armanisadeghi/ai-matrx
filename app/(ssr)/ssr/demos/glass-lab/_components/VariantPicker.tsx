"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toggleMode } from "@/styles/themes/themeSlice";
import { Moon, Sun } from "lucide-react";

export interface GlassVariant {
  id: string;
  className: string;
  label: string;
  description: string;
  adaptive?: boolean;
}

export const GLASS_VARIANTS: GlassVariant[] = [
  {
    id: "v1",
    className: "glab-v1",
    label: "Current matrx-glass-thin-border",
    description:
      "Reads --matrx-glass-* live. Baseline / control. This is what fails in the screenshot.",
  },
  {
    id: "v2",
    className: "glab-v2",
    label: "Polarity-flipping tint",
    description:
      "Higher-alpha tint that owns its theme polarity. Light = whitish 55%, dark = #14161e 55%. saturate 1.4.",
  },
  {
    id: "v3",
    className: "glab-v3",
    label: "Polarity tint, saturate=1",
    description:
      "Same as V2 but kills saturate. Tests whether the cyan halo from saturate(1.8) is hurting more than helping.",
  },
  {
    id: "v4",
    className: "glab-v4",
    label: "Vibrancy text on current glass",
    description:
      "Keeps current tint. Text uses mix-blend-mode multiply (light) or plus-lighter (dark). Tier 2 alone.",
  },
  {
    id: "v5",
    className: "glab-v5",
    label: "Polarity tint + vibrancy text (recommended)",
    description:
      "Tier 1 + Tier 2. Surface owns its polarity, text actively pushes against the backdrop.",
  },
  {
    id: "v6",
    className: "glab-v6",
    label: "Difference blend (auto-invert)",
    description:
      "White text + mix-blend-mode: difference. Always readable, always grayscale. Loses brand color.",
  },
  {
    id: "v7",
    className: "glab-v7",
    label: "Contrast halo (text-shadow)",
    description:
      "Current tint, current text — adds a thin opposite-polarity halo around every glyph.",
  },
  {
    id: "v8",
    className: "glab-v8",
    label: "prefers-contrast: more (a11y safety net)",
    description:
      "Only fires when OS-level high-contrast is on. Toggle macOS \u2318 Increase Contrast to test.",
  },
  {
    id: "v9",
    className: "glab-v9",
    label: "Per-text local backdrop invert",
    description:
      "Each text region renders its own backdrop-filter: invert behind itself. Heavy but striking.",
  },
  {
    id: "v10",
    className: "glab-v10",
    label: "Layered Apple vibrancy",
    description:
      "Higher tint + saturate 1.6 + inset highlight + vibrancy text. Closest pure-CSS macOS material.",
  },
  {
    id: "v11",
    className: "glab-v11",
    label: "Adaptive (JS luminance probe)",
    description:
      "Samples 9 points behind the widget, averages luminance, rewrites tint + text colors live as you drag.",
    adaptive: true,
  },
];

interface Props {
  activeId: string;
  onSelect: (id: string) => void;
}

export function VariantPicker({ activeId, onSelect }: Props) {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector((s) => s.theme.mode === "dark");

  return (
    <aside className="glab-controls" aria-label="Glass lab controls">
      <div className="glab-controls-title">Theme</div>
      <div className="glab-toolbar">
        <button
          type="button"
          data-active={!isDark}
          onClick={() => {
            if (isDark) dispatch(toggleMode());
          }}
        >
          <Sun className="inline-block w-3.5 h-3.5 -mt-0.5 mr-1" />
          Light
        </button>
        <button
          type="button"
          data-active={isDark}
          onClick={() => {
            if (!isDark) dispatch(toggleMode());
          }}
        >
          <Moon className="inline-block w-3.5 h-3.5 -mt-0.5 mr-1" />
          Dark
        </button>
      </div>

      <div className="glab-controls-title">Glass variant</div>
      {GLASS_VARIANTS.map((v) => (
        <button
          key={v.id}
          type="button"
          className="glab-variant-row"
          data-active={activeId === v.id}
          onClick={() => onSelect(v.id)}
        >
          <span className="glab-variant-tag">{v.id.toUpperCase()}</span>
          <span className="glab-variant-body">
            <span className="glab-variant-label">{v.label}</span>
            <span className="glab-variant-desc">{v.description}</span>
          </span>
        </button>
      ))}

      <div className="glab-controls-title">Tip</div>
      <p className="glab-variant-desc px-1">
        Drag the widget across every backdrop zone. Compare the two failure
        cases at the top — the white document and the black console — in both
        themes. A variant that reads cleanly on both, in both themes, is the
        winner.
      </p>
    </aside>
  );
}
