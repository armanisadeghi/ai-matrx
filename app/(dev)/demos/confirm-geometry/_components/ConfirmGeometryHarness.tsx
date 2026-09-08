"use client";

/**
 * THE GEOMETRIC PROOF for the confirm/alert/dialog sticky footer.
 *
 * WHY THIS EXISTS. `@ai-matrx/design-system` 0.11.2 shipped a ConfirmDialog
 * whose opaque sticky footer painted OVER the last pixels of a multi-line
 * consequence description whenever the card was not tall enough to scroll
 * (`scrollHeight === clientHeight`, so the occluded pixels could never be
 * revealed by scrolling). The package's own "never clamped or truncated" test
 * asserts DOM text and `aria-describedby` and passed the whole time: jsdom has
 * no layout, so no unit test in the package can see painted geometry.
 *
 * This page is the browser that can. It renders the REAL package
 * `ConfirmDialog` through the app's own host wrapper at 1..6-line consequences
 * and exposes `window.__confirmGeometry` — a scripted measurement any agent (or
 * a human) can run from the console, in light and dark, at any viewport:
 *
 *   await window.__confirmGeometry.runAll()
 *
 * It returns, per case, the description's `.bottom`, the footer's `.top`, the
 * overlap in px, and whether the body actually scrolls. THE INVARIANT: for
 * every description length, `descriptionBottom <= footerTop` (no occlusion),
 * and the card scrolls only when the VIEWPORT — never the footer — is the
 * constraint.
 *
 * Kept in the app rather than the package because the package has no
 * browser-capable test runner (no Playwright, no vitest-browser); the package
 * side of the guard is the structural invariant in `alert-dialog.test.tsx` /
 * `dialog.test.tsx` (the body must reserve the sticky footer's block size).
 */

import * as React from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Consequence copy at growing line counts. Real destructive-action copy shape:
 * the law requires naming what is lost, so these are the lengths the law
 * actively produces, not synthetic filler.
 */
const CASES: { id: string; lines: number; description: string }[] = [
  {
    id: "1-line",
    lines: 1,
    description: "Deletes 1 note permanently.",
  },
  {
    id: "2-line",
    lines: 2,
    description:
      "Deletes 3 notes and the folder that holds them permanently. This cannot be undone.",
  },
  {
    id: "3-line",
    lines: 3,
    description:
      "Deletes the folder “Client research” and the 14 notes inside it permanently, including 2 notes shared with other people in your organization. Shared links stop working immediately. This cannot be undone.",
  },
  {
    id: "6-line",
    lines: 6,
    description:
      "Deletes the folder “Client research” and the 14 notes inside it permanently, including 2 notes shared with other people in your organization. Shared links stop working immediately and anyone holding one sees a 404. Every version in each note's history is destroyed with it, so a note you edited today cannot be rolled back to yesterday. Attachments stored on those notes are released from storage and their file ids stop resolving anywhere in the platform. Any workflow, agent or scheduled task that reads from this folder will start failing on its next run. This cannot be undone.",
  },
];

type Measurement = {
  id: string;
  lines: number;
  descriptionBottom: number;
  footerTop: number;
  /** Positive = the footer paints over the description by this many px. */
  overlapPx: number;
  cardScrolls: boolean;
  measuredAtScrollBottom: boolean;
  scrollHeight: number;
  clientHeight: number;
  viewportHeight: number;
  theme: "light" | "dark";
  pass: boolean;
};

export function ConfirmGeometryHarness() {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Measurement[] | null>(null);
  // The api object is handed out once and cached by whoever grabbed it, so the
  // open case has to be read through a ref rather than an effect closure.
  const openIdRef = React.useRef<string | null>(null);
  openIdRef.current = openId;

  React.useEffect(() => {
    const measure = (): Measurement | null => {
      const dialog = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-content"]',
      );
      if (!dialog) return null;
      const describedBy = dialog.getAttribute("aria-describedby");
      const description = describedBy
        ? document.getElementById(describedBy)
        : null;
      const footer = dialog.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-footer"]',
      );
      if (!description || !footer) return null;
      const cardScrolls = dialog.scrollHeight > dialog.clientHeight;
      // THE INVARIANT, stated for both cases. A card that does not scroll must
      // never let the footer cover the description at rest. A card that DOES
      // scroll may put the description under the footer — that is what a sticky
      // footer is for — but only if scrolling all the way down reveals it, so
      // the measurement is taken at the bottom of the scroll.
      if (cardScrolls) dialog.scrollTop = dialog.scrollHeight;
      const descriptionBottom = description.getBoundingClientRect().bottom;
      const footerTop = footer.getBoundingClientRect().top;
      const overlapPx = Number((descriptionBottom - footerTop).toFixed(2));
      const current = openIdRef.current;
      const active = CASES.find((c) => c.id === current);
      return {
        id: current ?? "unknown",
        lines: active?.lines ?? 0,
        descriptionBottom: Number(descriptionBottom.toFixed(2)),
        footerTop: Number(footerTop.toFixed(2)),
        overlapPx,
        cardScrolls,
        /** Measured at the bottom of the scroll when the card scrolls. */
        measuredAtScrollBottom: cardScrolls,
        scrollHeight: dialog.scrollHeight,
        clientHeight: dialog.clientHeight,
        viewportHeight: window.innerHeight,
        theme: document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
        pass: overlapPx <= 0,
      };
    };

    const api = {
      cases: CASES.map((c) => c.id),
      // setTimeout, never rAF: a hidden/background tab never paints a frame,
      // and an agent driving this from a hidden pane must still get an answer.
      open: (id: string) =>
        new Promise<void>((resolve) => {
          setOpenId(id);
          setTimeout(resolve, 400);
        }),
      close: () =>
        new Promise<void>((resolve) => {
          setOpenId(null);
          setTimeout(resolve, 400);
        }),
      measure,
      runAll: async () => {
        const out: Measurement[] = [];
        for (const c of CASES) {
          await api.open(c.id);
          const m = measure();
          if (m) out.push(m);
          await api.close();
        }
        setResults(out);
        return {
          allPass: out.every((m) => m.pass),
          worstOverlapPx: Math.max(...out.map((m) => m.overlapPx)),
          results: out,
        };
      },
    };
    (window as unknown as { __confirmGeometry: typeof api }).__confirmGeometry =
      api;
    return () => {
      delete (window as unknown as { __confirmGeometry?: unknown })
        .__confirmGeometry;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Confirm dialog geometry proof</h1>
        <p className="text-sm text-muted-foreground">
          The sticky footer must never paint over the consequence. Open each
          case, or run{" "}
          <code className="rounded bg-muted px-1">
            await window.__confirmGeometry.runAll()
          </code>{" "}
          in the console. Pass = overlapPx &le; 0 for every line count, in light
          and dark, at any viewport height — measured at rest when the card does
          not scroll, and at the bottom of the scroll when the viewport (never
          the footer) forces it to.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {CASES.map((c) => (
          <Button
            key={c.id}
            variant="outline"
            size="sm"
            onClick={() => setOpenId(c.id)}
          >
            {c.id} consequence
          </Button>
        ))}
      </div>
      {results ? (
        <pre className="overflow-x-auto rounded border bg-muted/40 p-3 text-xs">
          {JSON.stringify(results, null, 2)}
        </pre>
      ) : null}
      {CASES.map((c) => (
        <ConfirmDialog
          key={c.id}
          open={openId === c.id}
          onOpenChange={(next) => setOpenId(next ? c.id : null)}
          title="Delete folder and everything in it?"
          description={c.description}
          confirmLabel="Delete forever"
          variant="destructive"
          onConfirm={() => setOpenId(null)}
        />
      ))}
    </div>
  );
}
