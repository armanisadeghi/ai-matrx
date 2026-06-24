"use client";

// Notes component salvage — audit 2026-06-24.
//
// We deleted 15 dead notes components. This page surfaces the ONE capability
// that was unique to a deleted component and worth keeping: the RAG / "add this
// note to the knowledge base" affordance from the old NoteToolbar. It's rebuilt
// here from the surviving primitives (ProcessForRagButton + useNoteIngestStatus)
// so you can see/try it and decide whether to wire it into the real /notes UI.
//
// The other distinct finds were behaviors, not components, and are listed below
// as port candidates.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Database, Trash2, ArrowRightLeft, Info } from "lucide-react";
import { ProcessForRagButton } from "@/features/rag/components/ProcessForRagButton";
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
          toast.success("Note indexed for RAG", {
            action: {
              label: "View in library",
              onClick: () => router.push("/rag/library"),
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
  "NoteToolbar.tsx — redundant; only the RAG cluster (shown left) was unique",
  "shell/ (7 files: NotesShell, NoteViewShell, NoteEditorPlaceholder, NotesMainArea, NotesTabBar, NotesSidebar, NotesSidebarClient) — abandoned RSC rewrite; 2 were self-labeled stubs",
  "NoteContextMenu, NoteContextMenuContent, noteContextMenuBridge — superseded by UnifiedAgentContextMenu",
  "NoteEditorWithChrome + actions/WindowNotesBody — the dead window editor that consumed the bespoke menu",
  "mobile/MobileActionsMenu, mobile/MobileFolderSelector — redundant with the live mobile header/dock",
];

const PORT_CANDIDATES = [
  {
    title: "RAG / knowledge-base indexing (shown at top)",
    detail:
      "ProcessForRagButton (sourceKind=\"note\") + useNoteIngestStatus dot. The canonical /notes tab has no way to index a note into the knowledge base. Worth wiring into the tab “…” menu.",
  },
  {
    title: "Sidebar drag-edge auto-scroll",
    detail:
      "The legacy NotesSidebar auto-scrolled the list while dragging a note near the top/bottom edge. The canonical NoteSidebar dropped this. Behavior, not a component — port into NoteSidebar's DnD if note reordering grows.",
  },
  {
    title: "Mobile “New Folder” creation",
    detail:
      "MobileActionsMenu let you create a folder on mobile (TextInputDialog + findOrCreateEmptyNote). The live mobile surface only picks from existing folders. Both primitives survive — add a “New folder” entry to the mobile dock.",
  },
  {
    title: "Declarative single/split frame (RSC idea)",
    detail:
      "shell/NoteViewShell expressed single-vs-split layout as a tiny declarative frame. NotesView inlines split imperatively. Not worth resurrecting, but the pattern is a clean direction if /notes ever moves to server components.",
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
              Salvaged: add a note to the knowledge base (RAG)
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
              Still parallel: two notes UIs
            </h2>
          </div>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
            <code>NotesView</code> (live <code>/notes</code> + Notes window) and a
            legacy stack (<code>NotesLayout</code> / <code>NoteEditor</code> /{" "}
            <code>NoteTabs</code> / <code>NotesSidebar</code>) still coexist —
            the legacy one is reached only through the Utilities and Quick-Notes
            overlays. The canonical editor is a strict superset (find/replace,
            undo/redo, conflict handling, full action menu). Migrating those
            overlays onto <code>NotesView</code>/<code>NoteContentEditor</code>{" "}
            would retire the whole legacy stack — a separate decision.
          </p>
        </section>
      </div>
    </div>
  );
}
