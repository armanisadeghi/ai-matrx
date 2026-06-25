"use client";

/**
 * Universal Context Menu v3 — Canonical Proving Ground (ALL v3, no mixing).
 *
 * This page is the rollout reference. Each panel is a real v3 wiring:
 *
 *   Row 1 — the menu with NO surface direction, to see how it adapts on its own:
 *     1. Bare        — NonEditableContextMenu, no surfaceName / contentSource.
 *                      Copy still works (content self-resolved from the DOM).
 *     2. Editable    — generic EditableContextMenu textarea (Cut/Paste/Save).
 *     3. Read-only   — NonEditableContextMenu over display text + contentSource.
 *                      Right-click WITHOUT selecting → Copy + Export → Download
 *                      as Markdown act on the whole block. (The v2 page leaves
 *                      Copy dead here — see /demos/context-menu/canonical-v2.)
 *
 *   Row 2 — the EXACT menus we roll out to these surfaces:
 *     4. Agents · 5. Notes · 6. Code editor — production-target surface props.
 *
 * The v2 reference lives at /demos/context-menu/canonical-v2.
 */

import { useRef, useState } from "react";
import { Code2 } from "lucide-react";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { AgentBuilderDemoPanel } from "../_components/AgentBuilderDemoPanel";
import { CodeEditorDemoPanel } from "../_components/CodeEditorDemoPanel";
import { NotesDemoPanel } from "../_components/NotesDemoPanel";

const TEXTAREA_CLASS =
  "flex-1 min-h-[200px] w-full rounded-md border border-border bg-card p-3 text-[16px] outline-none focus:ring-2 focus:ring-primary";
const DISPLAY_CLASS =
  "min-h-[200px] w-full rounded-md border border-border bg-card p-3 text-[15px] leading-relaxed whitespace-pre-wrap overflow-auto";

const ARTICLE = `# The Case for Context Menus

Most apps treat the right-click menu as an afterthought — Cut, Copy, Paste, done.
Ours is the opposite: it is the fastest path to everything the system can do with
whatever you are looking at.

## Why it matters

A text area is never "just a few words." It might hold a full blog post, a system
prompt, a contract clause, or a research summary. The menu has to assume the
content is important and give you real tools: copy it five ways, download it,
convert it into a note or a task, hand it to an agent, share it.

## Try it

Right-click this block WITHOUT selecting anything, then:
- Export → Download as Markdown  (saves this whole article as .md)
- Export → Print
- Copy as → Markdown / for Docs / for Word
- Convert → Save to Notes / Save to Document
- AI Actions → run an agent on it`;

function PanelShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <header>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </header>
      {children}
    </section>
  );
}

export default function CanonicalContextMenuV3Page() {
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const [editValue, setEditValue] = useState(
    "Generic editable text area on the v3 menu.\n\nRight-click → Cut / Paste / Find & Replace, Copy as…, Export → Download as Markdown, Save / Delete.",
  );

  const [diffOriginal, setDiffOriginal] = useState(
    "You are a helpful assistant.\nAlways answer concisely.\nNever fabricate facts.",
  );
  const [diffModified, setDiffModified] = useState(
    "You are a concise, helpful assistant.\nAlways answer clearly and cite sources.\nNever fabricate facts.",
  );
  const openDiffWindow = useOpenDiffViewerWindow();

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <div className="border-b border-border bg-card/50 px-3 py-1.5 flex-shrink-0">
        <p className="text-[11px] text-muted-foreground">
          <b>Context Menu v3 — all panels are v3.</b> Row 1 = the menu with no
          surface direction (bare / editable / read-only). Row 2 = the exact
          menus we roll out to agents, notes, and code. v2 reference:{" "}
          <code>/demos/context-menu/canonical-v2</code>.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Row 1 — no surface direction */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <PanelShell
            title="1. Bare — no direction"
            hint="NonEditable · no surfaceName · content self-resolved from the DOM"
          >
            <NonEditableContextMenu sourceFeature="demo">
              <div className={DISPLAY_CLASS}>
                {
                  "This block has no surfaceName and no contentSource.\n\nThe menu still works: right-click (no selection) → Copy grabs this text via the DOM fallback, and AI Actions / Quick Actions come from your global context.\n\nNothing is wired here — this is what the menu does on its own."
                }
              </div>
            </NonEditableContextMenu>
          </PanelShell>

          <PanelShell
            title="2. Editable text area"
            hint="EditableContextMenu · Cut / Paste / Find / Save / Delete"
          >
            <EditableContextMenu
              sourceFeature="demo"
              getTextarea={() => editRef.current}
              onTextReplace={setEditValue}
              contentSource={{ type: "raw" }}
              contextData={{ content: editValue }}
              onSave={() => {}}
            >
              <textarea
                ref={editRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className={TEXTAREA_CLASS}
              />
            </EditableContextMenu>
          </PanelShell>

          <PanelShell
            title="3. Read-only display"
            hint="NonEditable + contentSource · right-click (no selection) → Export → Download as Markdown"
          >
            <NonEditableContextMenu
              sourceFeature="demo"
              contentSource={{ type: "raw" }}
              contextData={{ content: ARTICLE }}
            >
              <div className={DISPLAY_CLASS}>{ARTICLE}</div>
            </NonEditableContextMenu>
          </PanelShell>
        </div>

        {/* Row 2 — per-surface rollout reference */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <AgentBuilderDemoPanel
            title="4. Agents"
            description={
              <>
                Target <code>matrx-user/agent-builder</code> — full agent scope +{" "}
                <code>focused_field</code>, AI Actions + content blocks.
              </>
            }
            minHeightClass="min-h-[200px]"
          />
          <NotesDemoPanel
            title="5. Notes editor"
            description={
              <>
                Target <code>matrx-user/notes</code> — full surface scope +{" "}
                <code>extraSections</code> (Save / Export / Move / Delete).
              </>
            }
            minHeightClass="min-h-[200px]"
          />
          <CodeEditorDemoPanel
            title="6. Code editor"
            description={
              <>
                Target <code>matrx-user/code-editor</code> — full{" "}
                <code>vsc_*</code> context + placeholder diagnostics.
              </>
            }
            minHeightClass="min-h-[200px]"
          />
        </div>

        {/* Diff — live (Compare action target) */}
        <section className="rounded-md border border-border">
          <header className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">
                Diff — live (right-click → Compare)
              </h2>
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
