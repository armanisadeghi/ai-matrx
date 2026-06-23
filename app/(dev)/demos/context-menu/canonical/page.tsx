"use client";

/**
 * UniversalContextMenuV2 — Canonical Proving Ground
 *
 * One page to validate the whole system as we build it:
 *   - The SAME core menu rendered behind four "wrappers" (none / agent /
 *     notes / code) so you can confirm parity + per-surface tuning.
 *   - The `extraSections` injection contract (the Notes panel injects
 *     surface-specific items — Save / Export / Move / Delete — without
 *     reimplementing the menu).
 *   - The Diff system live: right-click → Compare → "Compare with clipboard"
 *     (or Set base / Compare with base), plus an always-on inline DiffViewer
 *     and an "Open in window" button.
 *
 * Panels 2–4 use production-*target* wiring (what surfaces should emit),
 * not necessarily what legacy routes ship today.
 */

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Code2 } from "lucide-react";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { AgentBuilderDemoPanel } from "../_components/AgentBuilderDemoPanel";
import { CodeEditorDemoPanel } from "../_components/CodeEditorDemoPanel";
import { NotesDemoPanel } from "../_components/NotesDemoPanel";

const UniversalContextMenuV2 = dynamic(
  () =>
    import("@/features/context-menu-v2/UnifiedAgentContextMenu").then((m) => ({
      default: m.UniversalContextMenuV2,
    })),
  { ssr: false },
);

const TEXTAREA_CLASS =
  "flex-1 min-h-[180px] w-full rounded-md border border-border bg-card p-3 text-[16px] outline-none focus:ring-2 focus:ring-primary";

export default function CanonicalContextMenuPage() {
  const noneRef = useRef<HTMLTextAreaElement | null>(null);
  const [noneValue, setNoneValue] = useState(
    "No-wrapper panel.\nRaw UniversalContextMenuV2 with hand-set contextData.\nRight-click → Compare → Compare with clipboard.",
  );

  const [diffOriginal, setDiffOriginal] = useState(
    "You are a helpful assistant.\nAlways answer concisely.\nNever fabricate facts.",
  );
  const [diffModified, setDiffModified] = useState(
    "You are a concise, helpful assistant.\nAlways answer clearly and cite sources.\nNever fabricate facts.",
  );
  const openDiffWindow = useOpenDiffViewerWindow();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-border bg-card/50 px-3 py-1.5 flex-shrink-0">
        <p className="text-[11px] text-muted-foreground">
          One core menu, four wrappers. Right-click any panel → <b>Compare</b> →
          “Compare with clipboard”. Panels 2–4 mirror production-target wiring
          for agent-builder, notes, and <code>/code</code>. Diff is live below.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <section className="flex flex-col gap-2">
            <header>
              <h2 className="text-sm font-semibold">1. No wrapper</h2>
              <p className="text-[11px] text-muted-foreground">
                raw core · no surfaceName
              </p>
            </header>
            <UniversalContextMenuV2
              sourceFeature="demo"
              getTextarea={() => noneRef.current}
              onTextReplace={setNoneValue}
              isEditable
              contextData={{ content: noneValue, context: "no-wrapper" }}
            >
              <textarea
                ref={noneRef}
                value={noneValue}
                onChange={(e) => setNoneValue(e.target.value)}
                className={TEXTAREA_CLASS}
              />
            </UniversalContextMenuV2>
          </section>

          <AgentBuilderDemoPanel
            title="2. Agent builder"
            description={
              <>
                Target <code>matrx-user/agent-builder</code> — full agent scope
                + <code>focused_field</code>, AI Actions + content blocks +
                quick actions.
              </>
            }
          />

          <NotesDemoPanel
            title="3. Notes editor"
            description={
              <>
                Target <code>matrx-user/notes</code> — full surface scope +{" "}
                <code>extraSections</code> (Save / Export / Move / Delete).
              </>
            }
          />

          <CodeEditorDemoPanel
            title="4. Code editor"
            description={
              <>
                Target <code>matrx-user/code-editor</code> — full{" "}
                <code>vsc_*</code> context + placeholder diagnostics.
              </>
            }
          />
        </div>

        <section className="rounded-md border border-border">
          <header className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Diff — live</h2>
            </div>
            <button
              className="text-xs rounded border border-border px-2 py-1 hover:bg-accent"
              onClick={() =>
                openDiffWindow({
                  original: diffOriginal,
                  modified: diffModified,
                  originalLabel: "Original",
                  modifiedLabel: "Modified",
                  title: "Diff (window)",
                  engine: "light",
                })
              }
            >
              Open in window
            </button>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="grid grid-rows-2 border-r border-border">
              <textarea
                value={diffOriginal}
                onChange={(e) => setDiffOriginal(e.target.value)}
                spellCheck={false}
                className="resize-none border-b border-border bg-background p-2 font-mono text-xs outline-none min-h-[120px]"
              />
              <textarea
                value={diffModified}
                onChange={(e) => setDiffModified(e.target.value)}
                spellCheck={false}
                className="resize-none bg-background p-2 font-mono text-xs outline-none min-h-[120px]"
              />
            </div>
            <div className="min-h-[240px]">
              <DiffViewer
                original={diffOriginal}
                modified={diffModified}
                engine="light"
                originalLabel="Original"
                modifiedLabel="Modified"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
