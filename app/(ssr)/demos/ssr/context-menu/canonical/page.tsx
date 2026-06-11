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
 * Everything loads via next/dynamic — nothing here is in the initial chunk,
 * and the unified-menu fetch is single-flight + never-refetch (see
 * fetchUnifiedMenu thunk). Watch the dev console / Network tab: one call.
 */

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Save, Download, FolderInput, Trash2, Code2 } from "lucide-react";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import type { ContextMenuExtraSection } from "@/features/context-menu-v2/extraSections";

// Dynamic — the heavy menu (hook + body + modals) is excluded from the
// initial chunk and loads only when the panel mounts it.
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
  // ── No wrapper ──────────────────────────────────────────────────────────
  const noneRef = useRef<HTMLTextAreaElement | null>(null);
  const [noneValue, setNoneValue] = useState(
    "No-wrapper panel.\nRaw UniversalContextMenuV2 with hand-set contextData.\nRight-click → Compare → Compare with clipboard.",
  );

  // ── Agent-builder surface ─────────────────────────────────────────────────
  const agentRef = useRef<HTMLTextAreaElement | null>(null);
  const [agentValue, setAgentValue] = useState(
    "Agent-builder panel.\nsurfaceName = matrx-user/agent-builder.\nSame core menu, AI Actions resolve against this surface.",
  );

  // ── Notes surface (with injected extraSections) ───────────────────────────
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const [notesValue, setNotesValue] = useState(
    "Notes panel.\nThe Save / Export / Move / Delete items below the editing block are INJECTED via extraSections — the core menu renders them, the wrapper only describes them.",
  );
  const notesExtras: ContextMenuExtraSection[] = [
    {
      id: "notes-ops",
      label: "Note",
      anchor: "after-compare",
      items: [
        {
          kind: "item",
          id: "save",
          label: "Save",
          icon: Save,
          hint: "⌘S",
          onSelect: () => toast.success("Save (surface-specific demo action)"),
        },
        {
          kind: "item",
          id: "export",
          label: "Export as Markdown",
          icon: Download,
          onSelect: () => toast.success("Export (demo)"),
        },
        {
          kind: "submenu",
          id: "move",
          label: "Move to Folder",
          icon: FolderInput,
          children: [
            {
              kind: "item",
              id: "move-inbox",
              label: "Inbox",
              onSelect: () => toast.success("Moved to Inbox (demo)"),
            },
            {
              kind: "item",
              id: "move-archive",
              label: "Archive",
              onSelect: () => toast.success("Moved to Archive (demo)"),
            },
          ],
        },
        { kind: "separator", id: "sep" },
        {
          kind: "item",
          id: "delete",
          label: "Delete Note",
          icon: Trash2,
          destructive: true,
          onSelect: () => toast.error("Delete (demo — destructive styling)"),
        },
      ],
    },
  ];

  // ── Code surface (read-only, code-editor context) ─────────────────────────
  const [codeValue] = useState(
    "// Code panel (read-only)\n// surfaceName = matrx-user/code-editor, addedContexts=['code-editor']\nfunction greet(name) {\n  return `Hello, ${name}`;\n}",
  );

  // ── Diff playground ───────────────────────────────────────────────────────
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
          “Compare with clipboard”. The Notes panel shows{" "}
          <code>extraSections</code> injection. Diff is live at the bottom.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* No wrapper */}
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
              scope="user"
            >
              <textarea
                ref={noneRef}
                value={noneValue}
                onChange={(e) => setNoneValue(e.target.value)}
                className={TEXTAREA_CLASS}
              />
            </UniversalContextMenuV2>
          </section>

          {/* Agent builder */}
          <section className="flex flex-col gap-2">
            <header>
              <h2 className="text-sm font-semibold">2. Agent wrapper</h2>
              <p className="text-[11px] text-muted-foreground">
                surfaceName: <code>matrx-user/agent-builder</code>
              </p>
            </header>
            <UniversalContextMenuV2
              sourceFeature="agent-builder"
              surfaceName="matrx-user/agent-builder"
              getTextarea={() => agentRef.current}
              onTextReplace={setAgentValue}
              isEditable
              contextData={{
                content: agentValue,
                system_instruction: agentValue,
                focused_field: "system_instruction",
              }}
              scope="user"
            >
              <textarea
                ref={agentRef}
                value={agentValue}
                onChange={(e) => setAgentValue(e.target.value)}
                className={TEXTAREA_CLASS}
              />
            </UniversalContextMenuV2>
          </section>

          {/* Notes (extraSections) */}
          <section className="flex flex-col gap-2">
            <header>
              <h2 className="text-sm font-semibold">3. Notes wrapper</h2>
              <p className="text-[11px] text-muted-foreground">
                surfaceName: <code>matrx-user/notes</code> · +extraSections
              </p>
            </header>
            <UniversalContextMenuV2
              sourceFeature="notes"
              surfaceName="matrx-user/notes"
              getTextarea={() => notesRef.current}
              onTextReplace={setNotesValue}
              isEditable
              contextData={{ content: notesValue, context: "notes" }}
              extraSections={notesExtras}
              scope="user"
            >
              <textarea
                ref={notesRef}
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                className={TEXTAREA_CLASS}
              />
            </UniversalContextMenuV2>
          </section>

          {/* Code (read-only) */}
          <section className="flex flex-col gap-2">
            <header>
              <h2 className="text-sm font-semibold">4. Code wrapper</h2>
              <p className="text-[11px] text-muted-foreground">
                read-only · addedContexts <code>{`['code-editor']`}</code>
              </p>
            </header>
            <UniversalContextMenuV2
              sourceFeature="code-editor"
              surfaceName="matrx-user/code-editor"
              isEditable={false}
              addedContexts={["code-editor"]}
              contextData={{ content: codeValue, context: "code-editor" }}
              scope="user"
            >
              <pre className="flex-1 min-h-[180px] w-full rounded-md border border-border bg-card p-3 text-[13px] font-mono whitespace-pre-wrap overflow-auto">
                {codeValue}
              </pre>
            </UniversalContextMenuV2>
          </section>
        </div>

        {/* Diff playground */}
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
