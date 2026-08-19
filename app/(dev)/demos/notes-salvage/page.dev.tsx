"use client";

// Notes component salvage — audit 2026-06-24.
//
// We deleted 15 dead notes components. This page surfaces the ONE capability
// that was unique to a deleted component and worth keeping: the Knowledge / "add this
// note to the knowledge base" affordance from the old NoteToolbar. It's rebuilt
// here from the surviving primitives (ProcessForRagButton + useNoteIngestStatus)
// so you can see/try it and decide whether to wire it into the real /notes UI.
//
// The other distinct finds were behaviors, not components, and are listed below
// as port candidates.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Database, Trash2, ArrowRightLeft, Info } from "lucide-react";
import { ProcessForRagButton } from "@/features/knowledge/components/ProcessForRagButton";
import { useNoteIngestStatus } from "@/features/notes/hooks/useNoteIngestStatus";

/** The salvaged cluster, faithful to the deleted NoteToolbar (lines 174-210). */
function RagCluster({ noteId }: { noteId: string | null }) {
  const router = useRouter();
  const ingest = useNoteIngestStatus(noteId);
  return (
    <div className="flex items-center gap-2">
      <ProcessForRagButton
        sourceKind="note"
        sourceId={noteId}
        idleLabel="Add to knowledge base"
        completeLabel="Indexed"
        force
        disabled={!noteId}
        onComplete={() => {
          if (!noteId) return;
          window.dispatchEvent(
            new CustomEvent("cloud-files:document-processed", {
              detail: { fileId: noteId },
            }),
          );
          toast.success("Note indexed for Knowledge", {
            action: {
              label: "View in library",
              onClick: () => router.push("/knowledge/library"),
            },
          });
        }}
      />
      {ingest.state === "ingested" && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          In knowledge base
        </span>
      )}
      {ingest.state === "not_ingested" && noteId && (
        <span className="text-xs text-muted-foreground">Not indexed yet</span>
      )}
    </div>
  );
}

const DELETED = [
  "NoteToolbar.tsx — redundant; only the Knowledge cluster (shown left) was unique",
  "shell/ (7 files: NotesShell, NoteViewShell, NoteEditorPlaceholder, NotesMainArea, NotesTabBar, NotesSidebar, NotesSidebarClient) — abandoned RSC rewrite; 2 were self-labeled stubs",
  "NoteContextMenu, NoteContextMenuContent, noteContextMenuBridge — superseded by UnifiedAgentContextMenu",
  "NoteEditorWithChrome + actions/WindowNotesBody — the dead window editor that consumed the bespoke menu",
  "mobile/MobileActionsMenu, mobile/MobileFolderSelector — redundant with the live mobile header/dock",
];

const PORT_CANDIDATES = [
  {
    title: "Knowledge / knowledge-base indexing — SHIPPED (2026-06-24)",
    detail:
      "Now in the tab “…” menu (“Add to knowledge base” / “Knowledge base”, with an indexed dot) and the mobile dock’s More sheet. Opens NoteKnowledgePanel in a pop-out side panel: index/re-index + the canonical Knowledge viewer (chunks + Test search). The live cluster above remains for quick trying.",
  },
  {
    title: "Sidebar drag-edge auto-scroll — SHIPPED (2026-06-24)",
    detail:
      "Ported into NoteSidebar (handleListAutoScroll): the note list auto-scrolls while you drag a note near its top/bottom edge.",
  },
  {
    title: "Mobile “New Folder” creation — SHIPPED (2026-06-24)",
    detail:
      "Added to the mobile dock’s Folder sheet (MobileNoteToolbar) — reuses the desktop CreateFolderDialog + createFolder, then moves the current note into the new folder.",
  },
  {
    title: "Declarative single/split frame — CAPABILITY SHIPPED (verified 2026-08-14)",
    detail:
      "The RSC shell/NoteViewShell file was never resurrected, but the capability it framed is live and richer: NotesView renders single vs. side-by-side from one per-instance splitNoteId (with a labeled close-split header), NoteEditorCore carries the in-editor MatrxSplit, SplitNotePicker chooses the second note, and split is the persisted default editor mode at ≥900px. Nothing is missing — only the RSC expression of it.",
  },
];

export default function NotesSalvageDemoPage() {
  const [noteId, setNoteId] = useState("");
  const trimmed = noteId.trim() || null;

  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-xl font-semibold text-foreground">
          Notes component salvage
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Audit 2026-06-24 — 15 dead notes components deleted. Nothing was a
          better whole component; the canonical stack won everywhere. Only a few
          distinct capabilities were worth keeping — the headline one is live
          below.
        </p>

        {/* The one capability worth adding to /notes */}
        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Salvaged: add a note to the knowledge base (Knowledge)
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            From the deleted <code>NoteToolbar</code>. Rebuilt from surviving
            primitives. Paste a real note id (grab one from a <code>/notes</code>{" "}
            tab or URL) to try it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
              placeholder="note id (uuid)"
              className="h-9 w-[22rem] rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              spellCheck={false}
            />
            <RagCluster noteId={trimmed} />
          </div>
        </section>

        {/* Port candidates */}
        <section className="mt-6">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Distinct behaviors worth porting (not whole components)
            </h2>
          </div>
          <div className="mt-2 space-y-2">
            {PORT_CANDIDATES.map((p) => (
              <div
                key={p.title}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="text-xs font-medium text-foreground">
                  {p.title}
                </div>
                <div className="text-[0.6875rem] leading-snug text-muted-foreground">
                  {p.detail}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What was deleted */}
        <section className="mt-6">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Deleted (15 files — zero live consumers)
            </h2>
          </div>
          <ul className="mt-2 space-y-1">
            {DELETED.map((d) => (
              <li
                key={d}
                className="text-[0.6875rem] leading-snug text-muted-foreground"
              >
                • {d}
              </li>
            ))}
          </ul>
        </section>

        {/* The bigger open question */}
        <section className="mt-6 rounded-lg border border-amber-300/50 bg-amber-50 p-4 dark:border-amber-700/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Legacy shell: zero mounters, superset claim verified
            </h2>
          </div>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
            The legacy stack (<code>NotesLayout</code> → <code>NotesSidebar</code>{" "}
            / <code>NoteTabs</code> / <code>NoteEditor</code>, plus{" "}
            <code>NotesHeaderPortal</code>, <code>useAutoSave</code>,{" "}
            <code>phantomNote</code>, and <code>NotesTreeView</code>) no longer
            renders anywhere: the Utilities and Quick-Notes overlays moved to{" "}
            <code>NotesView</code> on 2026-07-10, and this page only describes it.
            The &ldquo;strict superset&rdquo; claim was re-verified item by item on
            2026-08-14 — all four salvage targets are landed, and the canonical
            stack also wins on keyboard shortcuts, tab drag-reorder, sidebar
            drag-to-folder, search, and the empty state. No surviving unique
            capability was found. Retiring the shell is Arman&rsquo;s call, not an
            agent&rsquo;s — see <code>features/notes/FEATURE.md</code>.
          </p>
        </section>
      </div>
    </div>
  );
}
