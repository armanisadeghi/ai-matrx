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
import { ChatAnswerMenuProposal } from "./_components/answer-menu/ChatAnswerMenuProposal";
import { ContentMenuIdeas } from "./_components/answer-menu/ContentMenuIdeas";

type SurfaceKey = "table" | "quiz" | "note";

const SURFACES: { key: SurfaceKey; title: string; noun: string }[] = [
  { key: "table", title: "Data table · /data row", noun: "table" },
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

/** Where a surface is right-clicked to draw its menu: its first row, or its text. */
function probe(root: HTMLElement): HTMLElement | null {
  return (
    root.querySelector<HTMLElement>("[data-demo-row]") ??
    root.querySelector<HTMLElement>("[data-row-id] td[data-matrx-table-column-id]") ??
    root.querySelector<HTMLElement>("[data-row-id]") ??
    root.querySelector<HTMLElement>("textarea, [contenteditable='true']")
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function openMenu(root: HTMLElement) {
  const el = probe(root);
  if (!el) return;
  const box = el.getBoundingClientRect();
  el.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: box.left + Math.min(40, box.width / 2),
      clientY: box.top + Math.min(12, box.height / 2),
    }),
  );
}

/** A frozen copy of exactly what the real menu drew (no handlers; right-click the surface to use it). */
function freeze(el: Element): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.removeAttribute("style");
  copy.style.position = "static";
  copy.style.maxHeight = "none";
  copy.setAttribute("aria-hidden", "true");
  // A copy must never be mistaken for a live menu by the next capture.
  copy.removeAttribute("data-alchemy-layout");
  copy.removeAttribute("data-alchemy-submenu");
  copy.removeAttribute("data-state");
  copy.setAttribute("data-frozen-menu", "");
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  copy.querySelectorAll("input").forEach((n) => n.setAttribute("tabindex", "-1"));
  return copy;
}

/** Open each surface's real menu in turn and freeze what it drew (+ its Intelligence submenu). */
async function captureAll(
  roots: Map<string, HTMLDivElement>,
  slots: Map<string, HTMLDivElement>,
  isCurrent: () => boolean,
) {
  for (const [id, root] of roots) {
    if (!isCurrent()) return;
    const slot = slots.get(id);
    if (!slot) continue;
    // The previous menu must be gone first, or its closing copy is what gets frozen.
    for (let i = 0; i < 30 && document.querySelector("[data-alchemy-layout]"); i++) await sleep(100);
    openMenu(root);
    let menu: Element | null = null;
    for (let i = 0; i < 40 && !menu; i++) {
      await sleep(100);
      const m = document.querySelector('[data-alchemy-layout][data-state="open"]');
      if (m && m.querySelectorAll("[data-alchemy-node]").length > 0) menu = m;
    }
    if (!menu) continue;
    await sleep(3000); // agent libraries finish loading
    const parts: HTMLElement[] = [freeze(menu)];
    const ai = menu.querySelector<HTMLElement>('[data-alchemy-node="proposed:intelligence"]');
    if (ai) {
      // Hover, never the keyboard: a keyboard open focuses the first row (Chat) and a stray key runs it.
      const r = ai.getBoundingClientRect();
      const at = { bubbles: true, pointerType: "mouse", clientX: r.left + 20, clientY: r.top + 5 };
      ai.dispatchEvent(new PointerEvent("pointerover", at));
      ai.dispatchEvent(new PointerEvent("pointerenter", at));
      ai.dispatchEvent(new PointerEvent("pointermove", at));
      await sleep(1200);
      const sub = document.querySelector('[data-alchemy-submenu="proposed:intelligence"]');
      if (sub) parts.push(freeze(sub));
    }
    slot.replaceChildren(...parts);
    // Escape closes the menu (and its submenu) without running anything.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(250);
  }
}

function Column({
  k,
  side,
  viewer,
  register,
  registerSlot,
}: {
  k: SurfaceKey;
  side: "today" | "proposed";
  viewer: boolean;
  register: (el: HTMLDivElement | null) => void;
  registerSlot: (el: HTMLDivElement | null) => void;
}) {
  const noun = SURFACES.find((s) => s.key === k)!.noun;
  const body = (
    <div ref={register} className="w-[300px] shrink-0">
      <Surface k={k} side={side} viewer={viewer} />
    </div>
  );
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {side === "today" ? "Today" : "Proposed"}
      </div>
      <div className="flex flex-col items-start gap-3">
        {side === "proposed" ? <MenuRegroupProvider value={proposedValue(noun)}>{body}</MenuRegroupProvider> : body}
        <div ref={registerSlot} className="pointer-events-none flex items-start gap-1" />
      </div>
    </div>
  );
}

export default function ContextMenuDesignsPage() {
  const [viewer, setViewer] = useState(false);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const roots = useRef(new Map<string, HTMLDivElement>());
  const slots = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    let current = true;
    const run = async () => {
      setBusy(true);
      await sleep(1500);
      await captureAll(roots.current, slots.current, () => current);
      if (current) setBusy(false);
    };
    void run();
    return () => {
      current = false;
    };
  }, [viewer, round]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-textured">
      <div className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-2 text-sm">
        <span className="font-medium">Right-click menu</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={viewer} onChange={(e) => setViewer(e.target.checked)} />
          Viewer rights (table)
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRound((n) => n + 1)}
          className="rounded-md border border-border px-2 py-0.5 hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Drawing…" : "Redraw"}
        </button>
        <span className="text-muted-foreground">Right-click any surface to use its live menu.</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-10">
          {SURFACES.map((s) => (
            <section key={s.key} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{s.title}</h2>
              <div className="flex items-start gap-10">
                {(["today", "proposed"] as const).map((side) => {
                  const id = `${s.key}:${side}`;
                  return (
                    <Column
                      key={side}
                      k={s.key}
                      side={side}
                      viewer={viewer}
                      register={(el) => {
                        if (el) roots.current.set(id, el);
                        else roots.current.delete(id);
                      }}
                      registerSlot={(el) => {
                        if (el) slots.current.set(id, el);
                        else slots.current.delete(id);
                      }}
                    />
                  );
                })}
              </div>
            </section>
          ))}
          <ChatAnswerMenuProposal />
          <ContentMenuIdeas />
        </div>
      </div>
    </div>
  );
}
