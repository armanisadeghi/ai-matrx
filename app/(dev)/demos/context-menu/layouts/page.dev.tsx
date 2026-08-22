"use client";

/**
 * Menu Layouts — the SAME notes menu, arranged four ways.
 *
 * Every panel is the exact /notes wiring (`matrx-user/notes`, full surface
 * scope, the full notes `extraSections` incl. super-admin rows). The ONLY
 * difference between panels is the `menuLayout` / `menuDensity` presentation
 * knobs (`features/context-menu-v3/model/layouts.ts`). Behaviour is identical:
 * one engine, one model, one renderer.
 *
 *   1. Current  — classic / comfortable  (what /notes ships today)
 *   2. Compact  — classic / compact      (same rows, tighter)
 *   3. Tiered   — icon strip + ≤ 8 grouped rows; the tail folds into named submenus
 *   4. Command  — tiered + type-to-filter across every action in the menu
 */

import { useState } from "react";
import { NotesDemoPanel } from "../_components/NotesDemoPanel";
import type { ContextMenuDensity } from "@/features/context-menu-v3/types";

const SAMPLE = `# Q3 launch notes

Right-click anywhere in this note. Highlight a sentence first to see the selection-aware version.

- Ship the onboarding flow by Friday
- Ask legal about the EU copy
- Draft the release email

{"version": 3, "flags": {"beta": true}}`;

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-primary"
      />
      {label}
    </label>
  );
}

export default function MenuLayoutsDemoPage() {
  const [compactNew, setCompactNew] = useState(false);
  const density: ContextMenuDensity = compactNew ? "compact" : "comfortable";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-b border-border bg-card/50 px-3 py-1.5">
        <p className="text-[11px] text-muted-foreground">
          <b>Same menu, four arrangements.</b> Every panel is the exact{" "}
          <code>/notes</code> menu — only the layout / density knob differs.
          Right-click each textarea (select text first for the selection-aware
          header). In <b>Command</b>, just start typing — e.g. <code>sum</code>,{" "}
          <code>move</code>, <code>md</code>.
        </p>
        <Toggle
          label="Compact rows on Tiered + Command"
          value={compactNew}
          onChange={setCompactNew}
        />
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <NotesDemoPanel
            title="1. Current — classic"
            description="What /notes ships today: every section at the top level (~30 rows on a full note)."
            initialContent={SAMPLE}
            minHeightClass="min-h-[240px]"
            menuOverrides={{ menuLayout: "classic", menuDensity: "comfortable" }}
          />
          <NotesDemoPanel
            title="2. Compact — classic rows, tighter"
            description="Identical structure; smaller rows / icons / labels. The cheapest change."
            initialContent={SAMPLE}
            minHeightClass="min-h-[240px]"
            menuOverrides={{ menuLayout: "classic", menuDensity: "compact" }}
          />
          <NotesDemoPanel
            title="3. Tiered — icon strip + folds"
            description="Copy/Cut/Paste/Undo/Redo/Find become an icon strip; AI stays on top; Note ops, Share & Export, and More fold into one submenu each. Rows the surface can never do are hidden, not greyed."
            initialContent={SAMPLE}
            minHeightClass="min-h-[240px]"
            menuOverrides={{ menuLayout: "tiered", menuDensity: density }}
          />
          <NotesDemoPanel
            title="4. Command — tiered + type-to-filter"
            description="Tiered, plus a filter box: typing flattens EVERY action in the menu (agents, shortcuts, content blocks, note ops, export formats…) into one ranked list with its breadcrumb. ↵ runs the first match."
            initialContent={SAMPLE}
            minHeightClass="min-h-[240px]"
            menuOverrides={{ menuLayout: "command", menuDensity: density }}
          />
        </div>
      </div>
    </div>
  );
}
