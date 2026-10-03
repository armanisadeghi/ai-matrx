"use client";

/**
 * Right-click menu — today vs proposed, on three real surfaces (Arman, 2026-10-02).
 *
 * Every menu here is the REAL menu: the real wrappers, the real registry, the real agent
 * libraries for each surface. The proposed side only re-arranges what the registry resolved
 * (`features/context-menu-v3/proposed/proposed-arrangement.ts`) and draws it large and header-less.
 * Each pair is drawn open beside its surface; right-click any surface to try it by hand.
 */

import { useEffect, useRef, useState } from "react";
import { MenuRegroupProvider, type MenuRegroupValue } from "@/features/context-menu-v3/regroup/RegroupContext";
import { proposedArrangement } from "@/features/context-menu-v3/proposed/proposed-arrangement";
import { NotesDemoPanel } from "../context-menu/_components/NotesDemoPanel";
import { QuizListPanel } from "../context-menu-regroup/_components/QuizListPanel";
import { TableRowsPanel } from "./_components/TableRowsPanel";

type SurfaceKey = "table" | "quiz" | "note";

const SURFACES: { key: SurfaceKey; title: string; noun: string }[] = [
  { key: "table", title: "Data table · /data-v2 row", noun: "table" },
  { key: "quiz", title: "Quiz · /education/quizzes row", noun: "quiz" },
  { key: "note", title: "Note · /notes editor", noun: "note" },
];

const NOTE_TEXT = `# Clinic intake checklist

- Confirm insurance card front and back
- Verify allergies and current medications
- Collect signed consent forms
- Book the follow-up before the patient leaves`;

function proposedValue(noun: string): MenuRegroupValue {
  return {
    grouping: null,
    mergeSameName: false,
    transform: (target, resolved) => proposedArrangement(target, resolved, { noun }),
    size: "large",
    hideHeader: true,
  };
}

function Surface({ k, side, viewer }: { k: SurfaceKey; side: "today" | "proposed"; viewer: boolean }) {
  if (k === "table") return <TableRowsPanel side={side} viewer={viewer} />;
  if (k === "quiz") return <QuizListPanel />;
  return (
    <NotesDemoPanel
      title="Clinic intake checklist"
      description=""
      initialContent={NOTE_TEXT}
      minHeightClass="min-h-[140px]"
    />
  );
}

/** Where a surface is right-clicked to draw its menu open: its first row, or its text. */
function probe(root: HTMLElement): HTMLElement | null {
  return (
    root.querySelector<HTMLElement>("[data-demo-row]") ??
    root.querySelector<HTMLElement>("[data-row-id] td[data-matrx-table-column-id]") ??
    root.querySelector<HTMLElement>("[data-row-id]") ??
    root.querySelector<HTMLElement>("textarea, [contenteditable='true']")
  );
}

function openAt(root: HTMLElement) {
  const el = probe(root);
  if (!el) return;
  const box = root.getBoundingClientRect();
  el.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: box.right + 12,
      clientY: box.top,
    }),
  );
}

function Column({
  k,
  side,
  viewer,
  register,
}: {
  k: SurfaceKey;
  side: "today" | "proposed";
  viewer: boolean;
  register: (el: HTMLDivElement | null) => void;
}) {
  const noun = SURFACES.find((s) => s.key === k)!.noun;
  const body = (
    <div ref={register} className="w-[300px] shrink-0">
      <Surface k={k} side={side} viewer={viewer} />
    </div>
  );
  return (
    <div className="flex min-h-[620px] w-[690px] shrink-0 flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {side === "today" ? "Today" : "Proposed"}
      </div>
      {side === "proposed" ? <MenuRegroupProvider value={proposedValue(noun)}>{body}</MenuRegroupProvider> : body}
    </div>
  );
}

export default function ContextMenuDesignsPage() {
  const [viewer, setViewer] = useState(false);
  const [pinned, setPinned] = useState(true);
  const roots = useRef(new Map<string, HTMLDivElement>());

  // Only the pairs on screen: a menu is drawn at a viewport point, so one opened off-screen would be
  // pushed back on screen on top of the others.
  const pinAll = () => {
    for (const el of roots.current.values()) {
      const top = el.getBoundingClientRect().top;
      if (top >= 0 && top < window.innerHeight - 240) openAt(el);
    }
  };

  useEffect(() => {
    if (!pinned) return;
    const first = window.setTimeout(pinAll, 900);
    let t = 0;
    const again = () => {
      window.clearTimeout(t);
      t = window.setTimeout(pinAll, 200);
    };
    const scroller = document.querySelector("[data-demo-scroll]");
    scroller?.addEventListener("scroll", again, { passive: true });
    window.addEventListener("resize", again);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(t);
      scroller?.removeEventListener("scroll", again);
      window.removeEventListener("resize", again);
    };
  }, [pinned, viewer]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-textured">
      <div className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-2 text-sm">
        <span className="font-medium">Right-click menu</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Show menus open
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={viewer} onChange={(e) => setViewer(e.target.checked)} />
          Viewer rights (table)
        </label>
        <button type="button" onClick={pinAll} className="rounded-md border border-border px-2 py-0.5 hover:bg-accent">
          Redraw
        </button>
      </div>
      <div data-demo-scroll="" className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-10">
          {SURFACES.map((s) => (
            <section key={s.key} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{s.title}</h2>
              <div className="flex gap-6">
                {(["today", "proposed"] as const).map((side) => (
                  <Column
                    key={side}
                    k={s.key}
                    side={side}
                    viewer={viewer}
                    register={(el) => {
                      const id = `${s.key}:${side}`;
                      if (el) roots.current.set(id, el);
                      else roots.current.delete(id);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
