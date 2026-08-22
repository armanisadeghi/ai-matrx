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
 *   1. Classic  — classic / comfortable  (the previous platform default)
 *   2. Compact  — classic / compact      (same rows, tighter)
 *   3. Tiered   — compact header (hover = text) + icon strip; EVERY classic row
 *                 stays by name (History groups Undo/Redo/View History/Compare)
 *   4. Command  — tiered + type-to-filter across every action in the menu
 *
 * THE LOSSLESS LAW: no layout may hide, rename, or drop a row Classic shows.
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
            title="1. Classic — the previous default"
            description="Every section at the top level (~30 rows on a full note). Command (panel 4) is the platform default since 2026-08-22."
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
            title="3. Tiered — icon strip, nothing lost"
            description="Hover the header to see the text. Copy/Cut/Paste/Undo/Redo/Find become the icon strip; every other row keeps its Classic name and place — only History groups Undo/Redo/View History/Compare, and the notes rows fold under Note. Greyed when unavailable, never hidden."
            initialContent={SAMPLE}
            minHeightClass="min-h-[240px]"
            menuOverrides={{ menuLayout: "tiered", menuDensity: density }}
          />
          <NotesDemoPanel
            title="4. Command — tiered + type-to-filter"
            description="Tiered, plus a filter box: typing flattens EVERY action in the menu (agents, shortcuts, content blocks, note ops, export formats…) into one ranked list with its breadcrumb. ↵ runs the first match. Start typing the moment the menu opens."
            initialContent={SAMPLE}
            minHeightClass="min-h-[240px]"
            menuOverrides={{ menuLayout: "command", menuDensity: density }}
          />
        </div>
      </div>
    </div>
  );
}
