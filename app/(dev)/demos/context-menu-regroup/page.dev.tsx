"use client";

/**
 * Right-click menu regroup — the decision page (Arman, 2026-09-27: "present me
 * a demo page with a side by side and a list that shows what goes where").
 *
 * Three real contexts — a quiz list row, a note's content, a text field — each
 * shown twice: TODAY's menu on the left and the PROPOSED grouping on the right.
 * Both sides are the real menu (the same wrappers, the same registry); the right
 * side only resolves through `PROPOSED_MENU_GROUPING`, so nothing is hand-copied.
 * Under them, "What goes where" is generated from what the registry resolved on
 * the left, and any item the proposal leaves without a home is listed in red.
 *
 * The grouping applies only inside this page's MenuRegroupProvider; production
 * menus are unchanged until Arman approves it.
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import {
  MenuRegroupProvider,
  type MenuResolutionReport,
} from "@/features/context-menu-v3/regroup/RegroupContext";
import { PROPOSED_MENU_GROUPING } from "@/features/context-menu-v3/regroup/proposed-grouping";
import { auditRegroup, type RegroupAudit } from "@/features/context-menu-v3/regroup/grouping";
import { ErrorNotice } from "@ai-matrx/design-system";
import { NotesDemoPanel } from "../context-menu/_components/NotesDemoPanel";
import { QuizListPanel } from "./_components/QuizListPanel";
import { WhereTable } from "./_components/WhereTable";
import { CategoriesTable } from "./_components/CategoriesTable";

type ContextKey = "quiz" | "note" | "field";

const CONTEXTS: { key: ContextKey; title: string; hint: string }[] = [
  { key: "quiz", title: "A quiz in a list", hint: "Right-click a quiz row." },
  { key: "note", title: "A note’s content", hint: "Right-click inside the note. Select a sentence first to see the selection version." },
  { key: "field", title: "A text field", hint: "Right-click inside the field." },
];

const NOTE_TEXT = `# Clinic intake checklist

- Confirm insurance card front and back
- Verify allergies and current medications
- Collect signed consent forms
- Book the follow-up before the patient leaves`;

const FIELD_TEXT =
  "Hi Priya, thanks for sending the signed consent forms. Your follow-up is booked for Tuesday at 10:30. Reply here if that time no longer works.";

/** Where to right-click to read a context's menu. */
function probeTarget(root: HTMLElement, key: ContextKey): HTMLElement | null {
  if (key === "quiz") {
    return (
      root.querySelector<HTMLElement>("[data-row-id] td[data-matrx-table-column-id]") ??
      root.querySelector<HTMLElement>("[data-row-id]")
    );
  }
  return root.querySelector<HTMLElement>("textarea");
}

function rightClick(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  el.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: rect.left + Math.min(40, rect.width / 2),
      clientY: rect.top + Math.min(12, rect.height / 2),
    }),
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function TextFieldPanel() {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(FIELD_TEXT);
  return (
    <EditableContextMenu
      sourceFeature="code-editor"
      getTextarea={() => ref.current}
      onTextReplace={setValue}
      contentSource={{ type: "raw" }}
      contextData={{ content: value }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Reply to patient"
        className="min-h-[150px] w-full rounded-md border border-border bg-card p-3 text-base outline-none focus:ring-2 focus:ring-primary"
      />
    </EditableContextMenu>
  );
}

function Surface({ contextKey, side }: { contextKey: ContextKey; side: "today" | "proposed" }) {
  if (contextKey === "quiz") return <QuizListPanel />;
  if (contextKey === "note") {
    return (
      <NotesDemoPanel
        title={side === "today" ? "Note (today’s menu)" : "Note (v2 menu)"}
        description="The exact /notes menu wiring."
        initialContent={NOTE_TEXT}
        minHeightClass="min-h-[150px]"
      />
    );
  }
  return <TextFieldPanel />;
}

export default function ContextMenuRegroupPage() {
  const [mergeSameName, setMergeSameName] = useState(true);
  const [reports, setReports] = useState<Partial<Record<ContextKey, MenuResolutionReport>>>({});
  const [reading, setReading] = useState(false);
  const roots = useRef<Partial<Record<ContextKey, HTMLDivElement | null>>>({});
  const lastReportAt = useRef<Partial<Record<ContextKey, number>>>({});
  const closers = useRef<Partial<Record<ContextKey, () => void>>>({});
  const probing = useRef<ContextKey | null>(null);

  const onResolved = (key: ContextKey) => (report: MenuResolutionReport, close: () => void) => {
    lastReportAt.current[key] = Date.now();
    if (probing.current === key) closers.current[key] = close;
    setReports((prev) => ({ ...prev, [key]: report }));
  };

  // Read each of today's menus once, the way a person would: right-click it,
  // let the registry resolve (agent lists included), close it.
  const readAll = async (alive: () => boolean) => {
    setReading(true);
    for (const { key } of CONTEXTS) {
      const root = roots.current[key];
      const el = root ? probeTarget(root, key) : null;
      if (!el || !alive()) continue;
      probing.current = key;
      lastReportAt.current[key] = undefined;
      rightClick(el);
      const started = Date.now();
      while (alive() && Date.now() - started < 8000) {
        await sleep(200);
        const at = lastReportAt.current[key];
        if (at && Date.now() - at > 1200) break;
      }
      closers.current[key]?.();
      closers.current[key] = undefined;
      probing.current = null;
      await sleep(250);
    }
    if (alive()) setReading(false);
  };

  const readOnMount = useEffectEvent((alive: () => boolean) => void readAll(alive));
  useEffect(() => {
    let alive = true;
    // Let the panels mount and the table draw its rows first.
    const timer = setTimeout(() => readOnMount(() => alive), 900);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const audits: Partial<Record<ContextKey, RegroupAudit | { error: string }>> = {};
  for (const { key } of CONTEXTS) {
    const report = reports[key];
    if (!report) continue;
    try {
      audits[key] = auditRegroup(report.target, report.resolved, PROPOSED_MENU_GROUPING, { mergeSameName }, report.arrangement);
    } catch (error) {
      audits[key] = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  const lostTotal = Object.values(audits).reduce(
    (n, a) => n + (a && "lost" in a ? a.lost.length : 0),
    0,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card/50 px-4 py-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Today’s right-click menu on the left, v2 on the right — both are the live menu. v2 groups every row by what
          you get: Copy, Download, Convert to, Publish, Share, Organize, History, AI, Read aloud, Compare, Edit,
          Feedback, Admin.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mergeSameName}
            onChange={(e) => setMergeSameName(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Merge same-name duplicates
        </label>
        <button
          type="button"
          disabled={reading}
          onClick={() => void readAll(() => true)}
          className="h-9 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-60"
        >
          {reading ? "Reading menus…" : "Re-read menus"}
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-auto px-4 py-4">
        {CONTEXTS.map(({ key, title, hint }) => {
          const audit = audits[key];
          return (
            <section key={key} className="space-y-2">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">{title}</h2>
                <p className="text-xs text-muted-foreground">
                  {hint}
                  {audit && "rows" in audit ? ` Rows on open: ${audit.currentRows} today → ${audit.proposedRows} in v2.` : ""}
                </p>
              </header>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today</p>
                  <div ref={(el) => void (roots.current[key] = el)}>
                    <MenuRegroupProvider value={{ grouping: null, mergeSameName, onResolved: onResolved(key) }}>
                      <Surface contextKey={key} side="today" />
                    </MenuRegroupProvider>
                  </div>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">v2</p>
                  <MenuRegroupProvider value={{ grouping: PROPOSED_MENU_GROUPING, mergeSameName }}>
                    <Surface contextKey={key} side="proposed" />
                  </MenuRegroupProvider>
                </div>
              </div>
            </section>
          );
        })}

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Rows when the menu opens</h2>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Context</th>
                  <th className="px-3 py-1.5 font-medium">Items</th>
                  <th className="px-3 py-1.5 font-medium">Rows today</th>
                  <th className="px-3 py-1.5 font-medium">Rows in v2</th>
                </tr>
              </thead>
              <tbody>
                {CONTEXTS.map(({ key, title }) => {
                  const audit = audits[key];
                  const ok = audit && "rows" in audit ? audit : null;
                  return (
                    <tr key={key} className="border-t border-border">
                      <td className="px-3 py-1.5 font-medium">{title}</td>
                      <td className="px-3 py-1.5">{ok ? ok.rows.length : "—"}</td>
                      <td className="px-3 py-1.5">{ok ? ok.currentRows : "—"}</td>
                      <td className="px-3 py-1.5 font-semibold">{ok ? ok.proposedRows : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <CategoriesTable
          grouping={PROPOSED_MENU_GROUPING}
          audits={Object.values(audits).filter((a): a is RegroupAudit => Boolean(a && "rows" in a))}
        />

        <section className="space-y-3">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">What goes where</h2>
            <p className={lostTotal > 0 ? "text-sm font-semibold text-destructive" : "text-xs text-muted-foreground"}>
              {lostTotal > 0
                ? `${lostTotal} item${lostTotal === 1 ? "" : "s"} would lose their place — listed in red below.`
                : "Every item today has a home in v2."}
            </p>
          </header>
          {CONTEXTS.map(({ key, title }) => {
            const audit = audits[key];
            if (audit && "error" in audit) {
              return (
                <ErrorNotice
                  key={key}
                  title={`${title}: the table could not be built`}
                  message={audit.error}
                  operation="Build the what-goes-where table"
                />
              );
            }
            return <WhereTable key={key} title={title} audit={audit ?? null} />;
          })}
        </section>
      </div>
    </div>
  );
}
