"use client";

/**
 * Canonical context menu — v2 reference (FROZEN).
 *
 * Kept for side-by-side comparison against the all-v3 page at
 * /demos/context-menu/canonical. The original elaborate multi-panel canonical
 * page (raw + agent + notes + code + diff) lives in git history; this is a
 * compact v2 snapshot so the OLD behavior stays observable — note that on the
 * read-only panel below, v2's Copy is disabled without a manual selection and
 * there is no Export / Download / Convert. That is exactly what v3 fixes.
 */

import { useRef, useState } from "react";
import dynamic from "next/dynamic";

const UniversalContextMenuV2 = dynamic(
  () =>
    import("@/features/context-menu-v2/UnifiedAgentContextMenu").then((m) => ({
      default: m.UniversalContextMenuV2,
    })),
  { ssr: false },
);

const TEXTAREA_CLASS =
  "flex-1 min-h-[200px] w-full rounded-md border border-border bg-card p-3 text-[16px] outline-none focus:ring-2 focus:ring-primary";
const DISPLAY_CLASS =
  "min-h-[200px] w-full rounded-md border border-border bg-card p-3 text-[15px] leading-relaxed whitespace-pre-wrap";

const SAMPLE = `# Quarterly Update

This is a read-only display. In v2, right-clicking here WITHOUT selecting text
leaves Copy disabled and offers no Export / Download / Convert.

Compare with the v3 page — same content, full capabilities.`;

export default function CanonicalV2Page() {
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const [editValue, setEditValue] = useState(
    "Editable textarea on the v2 menu.\nRight-click for the old menu.",
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <div className="border-b border-border bg-card/50 px-3 py-1.5 flex-shrink-0">
        <p className="text-[11px] text-muted-foreground">
          <b>v2 reference (frozen).</b> Compare against the all-v3 page at{" "}
          <code>/demos/context-menu/canonical</code>. Right-click the read-only
          panel: v2 Copy is disabled with no selection — v3 fixes that.
        </p>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <section className="flex flex-col gap-2">
            <header>
              <h2 className="text-sm font-semibold">Editable (v2)</h2>
              <p className="text-[11px] text-muted-foreground">
                raw core · no surfaceName
              </p>
            </header>
            <UniversalContextMenuV2
              sourceFeature="demo"
              isEditable
              getTextarea={() => editRef.current}
              onTextReplace={setEditValue}
              contextData={{ content: editValue, context: "v2-editable" }}
            >
              <textarea
                ref={editRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className={TEXTAREA_CLASS}
              />
            </UniversalContextMenuV2>
          </section>

          <section className="flex flex-col gap-2">
            <header>
              <h2 className="text-sm font-semibold">Read-only display (v2)</h2>
              <p className="text-[11px] text-muted-foreground">
                Copy disabled with no selection · no Export
              </p>
            </header>
            <UniversalContextMenuV2
              sourceFeature="demo"
              isEditable={false}
              contextData={{ content: SAMPLE, context: "v2-display" }}
            >
              <div className={DISPLAY_CLASS}>{SAMPLE}</div>
            </UniversalContextMenuV2>
          </section>
        </div>
      </div>
    </div>
  );
}
