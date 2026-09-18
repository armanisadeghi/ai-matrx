/**
 * A PILE LAUNCHES WHOLE, OR IT DOES NOT LAUNCH — a forcing function.
 *
 * ## What it exists to stop happening again
 *
 * `common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md` §9.1
 * and §9.6 (2026-09-18). An Expert dropped SEVENTEEN files onto a Rulebook and
 * pressed "Turn this into rules". Two became rules. Fifteen were never
 * submitted, and every screen downstream told the truth about a run nobody had
 * asked for.
 *
 *   * `platform.associations` shows the seventeen file→rulebook edges written
 *     ONE AT A TIME, ~0.3 s apart, 03:22:27.70 → 03:22:32.32 (the shared
 *     capture toolbar attaches in a serial `for … await attach(...)` loop).
 *   * `platform.masterwork_run` 937c0db3 started at 03:22:28.57 — before the
 *     fourth had landed — and `jsonb_array_length(settings->'resources')` is
 *     **2**.
 *   * The run then COMPLETED, and the screen said *"Stopped — 'Untitled File'
 *     failed. Nothing after it will run."* over a run that had run everything
 *     after it and finished.
 *
 * ## Three legs, each proven RED before the fix
 *
 *   1. a launch pressed while the serial attach loop is still landing submits
 *      NOTHING and says how many are still arriving — and the launch that
 *      follows carries all seventeen;
 *   2. a fan-out run with one failed row never says "stopped" or "nothing
 *      after it will run" — it says what did not work and that the rest are
 *      unaffected;
 *   3. an honestly-empty source and a refused one each render their OWN state
 *      and the server's own sentence, whole — a `no rules` row beside a `done`
 *      row, and the copy-protection refusal with its lawful routes intact.
 *
 * Nothing here mocks the thing under test. Leg 1 drives the REAL
 * `useLaunchGate` and the REAL `dumpResources` through the REAL serial attach
 * loop shape. Leg 2 drives the REAL `reduceIngestProgress` with the REAL event
 * shapes `dump_ingest.py` emits and renders the REAL `RunStages`. Leg 3 renders
 * the REAL `DumpOutcomes` over the REAL `parseDumpSummary` fed the wire shape
 * of `MasterworkDumpCompleteData` (aidream 1c9edb934c).
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useLaunchGate } from "@/lib/launch-gate/useLaunchGate";
import { failureSummary } from "@/lib/progress/honestSummary";
import {
  EMPTY_INGEST_PROGRESS,
  reduceIngestProgress,
  type IngestProgress,
} from "../durable-run/ingestProgress";
import { RunStages } from "../components/RunStages";
import {
  DumpOutcomes,
  dumpResources,
  launchKeyForEntity,
  parseDumpSummary,
  visibleLaunchKeys,
} from "../components/detail/RulebookSourcesPanel";

// React 19 + jsdom: without this every act() prints a warning that drowns the
// real output. It is a test-environment flag, not a stub of anything.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The seventeen files of the real run, named the way an Expert names files. */
const FILES = Array.from({ length: 17 }, (_, i) => ({
  token: "file",
  id: `f${String(i + 1).padStart(2, "0")}00000-0000-4000-8000-00000000000${
    i % 10
  }`,
  label: `page_${String(i + 1).padStart(2, "0")}.jpg`,
}));

// ── leg 1 ────────────────────────────────────────────────────────────────────

interface Launched {
  at: number;
  resources: Record<string, unknown>[];
}

/**
 * The panel's launch decision, with nothing else of the panel in it: the real
 * gate, the real payload builder, the real visible-key set, and the serial
 * attach loop the shared capture toolbar really runs
 * (`AssociationCaptureToolbar.uploadAndAttach`:
 * `for (const id of ids) { const res = await attach("file", id); … }`).
 */
function DumpLauncher({
  attachIntervalMs,
  launched,
  onReady,
}: {
  attachIntervalMs: number;
  launched: Launched[];
  onReady: (api: {
    attachAll: () => Promise<void>;
    press: () => void;
  }) => void;
}) {
  const gate = useLaunchGate();
  const [sourceLinks, setSourceLinks] = React.useState<
    { token: string; resourceId: string; label: string | null }[]
  >([]);
  const linksRef = React.useRef(sourceLinks);
  linksRef.current = sourceLinks;

  const visibleKeys = visibleLaunchKeys({ sourceLinks, stagedUrls: [] });
  const blocked = gate.blockingReason(visibleKeys);
  const busy = gate.busyLabel(visibleKeys);

  const api = {
    /** The toolbar's own loop: one attach at a time, each awaited. */
    attachAll: async () => {
      for (const file of FILES) {
        await gate.track(
          async () => {
            // The real association write: a round trip, then the row exists.
            await wait(attachIntervalMs);
            setSourceLinks((rows) => [
              ...rows,
              { token: file.token, resourceId: file.id, label: file.label },
            ]);
            return { ok: true as const };
          },
          {
            key: launchKeyForEntity(file.token, file.id),
            landed: (r) => r.ok,
          },
        );
      }
    },
    /** The button's onClick, verbatim in its decision. */
    press: () => {
      if (gate.blockingReason(visibleKeys)) return;
      launched.push({
        at: Date.now(),
        resources: dumpResources({
          sourceLinks: linksRef.current,
          stagedUrls: [],
          keptRows: [],
          titleFor: (_t, _i, label) => label ?? "",
        }),
      });
    },
  };
  onReady(api);

  return (
    <button type="button" data-testid="launch" data-blocked={blocked ?? ""}>
      {busy ?? "Turn this into rules"}
    </button>
  );
}

describe("leg 1 — a run may only launch with the set the person sees", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("refuses the press that lands in the gap, then carries all seventeen", async () => {
    const launched: Launched[] = [];
    let api: { attachAll: () => Promise<void>; press: () => void } | null = null;

    await act(async () => {
      root.render(
        <DumpLauncher
          attachIntervalMs={12}
          launched={launched}
          onReady={(next) => {
            api = next;
          }}
        />,
      );
    });

    // The drop: seventeen files, attaching one at a time.
    let loop: Promise<void> | null = null;
    await act(async () => {
      loop = api!.attachAll();
      // Long enough for a few edges to land — the 0.9 s the real click was
      // into the real loop, scaled to this loop's interval.
      await wait(40);
    });

    const button = container.querySelector(
      "[data-testid='launch']",
    ) as HTMLButtonElement;

    // What the person sees at that instant: not a live button.
    expect(button.getAttribute("data-blocked")).toMatch(
      /still attaching|not appeared in the list yet/i,
    );
    expect(button.textContent).toMatch(/^Attaching \d+ sources?…$/);

    // The press the Expert actually made.
    await act(async () => {
      api!.press();
    });
    expect(launched).toHaveLength(0); // ← RED before the gate: one run, 3 resources.

    // The loop finishes; now the button is live and carries the whole pile.
    await act(async () => {
      await loop;
    });
    expect(button.getAttribute("data-blocked")).toBe("");
    expect(button.textContent).toBe("Turn this into rules");

    await act(async () => {
      api!.press();
    });
    expect(launched).toHaveLength(1);
    expect(launched[0].resources).toHaveLength(17);
    expect(
      launched[0].resources.map((r) => r.id as string).sort(),
    ).toEqual(FILES.map((f) => f.id).sort());
  });

  it("stays shut while a landed attach has not reached the rendered list", async () => {
    // The second half of the race: `attach` RESOLVED, so nothing is in flight,
    // but the row has not arrived in this render. Launching here is the same
    // silent prefix by another route.
    function Host({ onReady }: { onReady: (v: unknown) => void }) {
      const gate = useLaunchGate();
      const visible = visibleLaunchKeys({ sourceLinks: [], stagedUrls: [] });
      onReady({
        gate,
        reason: () => gate.blockingReason(visible),
        pending: gate.pending,
      });
      return null;
    }
    let host: {
      gate: ReturnType<typeof useLaunchGate>;
      reason: () => string | null;
      pending: number;
    } | null = null;
    await act(async () => {
      root.render(<Host onReady={(v) => (host = v as typeof host)} />);
    });

    await act(async () => {
      await host!.gate.track(async () => ({ ok: true as const }), {
        key: launchKeyForEntity("file", "never-rendered"),
        landed: (r) => r.ok,
      });
    });

    expect(host!.pending).toBe(0);
    expect(host!.reason()).toMatch(/not appeared in the list yet/i);
  });
});

// ── leg 2 ────────────────────────────────────────────────────────────────────

/** The real `masterwork_dump_progress` transcript of a 17-source run. */
function seventeenSourceRun(failedIndex: number): IngestProgress {
  let progress = EMPTY_INGEST_PROGRESS;
  let total = 0;
  for (let i = 0; i < 17; i += 1) {
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      step: "resource_started",
      message: `Reading ${FILES[i].label} (${i + 1} of 17)…`,
      resource_index: i,
      resource_count: 17,
      kind: "entity",
      token: "file",
      id: FILES[i].id,
      title: FILES[i].label,
      rules_added_total: total,
    });
    const failed = i === failedIndex;
    if (!failed) total += 3;
    progress = reduceIngestProgress(progress, "masterwork_dump_progress", {
      step: failed ? "resource_failed" : "resource_done",
      message: failed
        ? `${FILES[i].label}: “${FILES[i].label}” is copy-protected (Adobe ADEPT), so we cannot read it — and we will never strip a publisher’s protection. What does work: a DRM-free copy of the same book (many publishers sell one directly); photos of the pages of your physical copy — we read those now; your own highlights export (Kindle’s “My Clippings.txt” or your Notebook page, or a Readwise export); the audiobook you own — we transcribe it.`
        : `${FILES[i].label}: 3 draft rule(s) added.`,
      resource_index: i,
      resource_count: 17,
      kind: "entity",
      token: "file",
      id: FILES[i].id,
      title: FILES[i].label,
      rules_added: failed ? 0 : 3,
      rules_added_total: total,
    });
  }
  return progress;
}

describe("leg 2 — one refused source never reports the batch as stopped", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("the primitive itself refuses sequence language over a fan-out", () => {
    const steps = seventeenSourceRun(1).resources;
    const sentence = failureSummary(steps, "fan_out");
    expect(sentence).not.toMatch(/stopped/i);
    expect(sentence).not.toMatch(/nothing after it will run/i);
    // It still names WHICH one, and still says the rest are fine.
    expect(sentence).toContain(FILES[1].label);
    expect(sentence).toMatch(/other 16 are unaffected/i);
    // And the ordered shape keeps the sentence it earned.
    expect(failureSummary(steps, "sequence")).toMatch(
      /nothing after it will run/i,
    );
  });

  it("the rendered lane says it too", async () => {
    const progress = seventeenSourceRun(1);
    await act(async () => {
      root.render(
        <RunStages
          run={{
            running: true,
            startedAt: Date.now() - 30_000,
            expectedMs: 90_000,
            progress,
            stages: [],
          }}
        />,
      );
    });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).not.toMatch(/Stopped —/);
    expect(text).not.toMatch(/Nothing after it will run/);
    // All seventeen were READ (the refused one included — it reached its own
    // outcome), and the lane says so rather than implying a halt.
    expect(text).toMatch(/17 of 17 sources read/);
    expect(text).toMatch(/other 16 are unaffected/i);
  });

  it("renders the refusal sentence WHOLE, remedies and all", async () => {
    await act(async () => {
      root.render(
        <RunStages
          run={{
            running: false,
            startedAt: Date.now() - 30_000,
            progress: seventeenSourceRun(1),
            stages: [],
          }}
        />,
      );
    });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("is copy-protected (Adobe ADEPT)");
    expect(text).toContain("we will never strip a publisher’s protection");
    // The lawful routes are the POINT of the sentence; a truncated refusal is
    // a dead end.
    expect(text).toContain("a DRM-free copy of the same book");
    expect(text).toContain("photos of the pages of your physical copy");
    expect(text).toContain("the audiobook you own — we transcribe it");
  });
});

// ── leg 3 ────────────────────────────────────────────────────────────────────

/** `MasterworkDumpCompleteData` as the server sends it (aidream 1c9edb934c). */
const TERMINAL_SUMMARY = {
  rulebook_id: "4a0fdf2a-6196-44dc-92f2-f238e5b70bb1",
  rulebook_version: 9,
  added: 45,
  duplicates_skipped: 2,
  resources: [
    {
      kind: "entity",
      token: "file",
      id: FILES[0].id,
      title: FILES[0].label,
      status: "ok",
      rules_added: 3,
      duplicates: 0,
    },
    {
      kind: "entity",
      token: "file",
      id: FILES[1].id,
      title: "quiet-page.jpg",
      status: "ok",
      rules_added: 0,
      duplicates: 0,
      note: "We read every word of “quiet-page.jpg” and found nothing that works as a rule — it reads as description rather than instruction.",
    },
    {
      kind: "entity",
      token: "file",
      id: FILES[2].id,
      title: "protected-novel.epub",
      status: "failed",
      rules_added: 0,
      duplicates: 0,
      error:
        "“protected-novel.epub” is copy-protected (Adobe ADEPT), so we cannot read it — and we will never strip a publisher’s protection. What does work: a DRM-free copy of the same book (many publishers sell one directly); photos of the pages of your physical copy — we read those now; your own highlights export (Kindle’s “My Clippings.txt” or your Notebook page, or a Readwise export); the audiobook you own — we transcribe it.",
    },
    {
      kind: "entity",
      token: "file",
      id: FILES[3].id,
      title: "already-read.txt",
      status: "already_distilled",
      rules_added: 0,
      duplicates: 0,
      already_distilled: {
        message:
          "This Rulebook already holds 11 rules from “already-read.txt”, so it was not read again.",
      },
    },
  ],
};

describe("leg 3 — every outcome the server sent gets its own honest row", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps a status it has never seen instead of deleting the row", () => {
    const parsed = parseDumpSummary({
      ...TERMINAL_SUMMARY,
      resources: [
        ...TERMINAL_SUMMARY.resources,
        {
          kind: "entity",
          token: "file",
          id: "future",
          title: "tomorrow.bin",
          status: "some_future_status",
          rules_added: 0,
          duplicates: 0,
        },
      ],
    });
    // ← RED before the fix: `already_distilled` and the unknown row were both
    // silently dropped, so the summary listed 2 of 5 sources.
    expect(parsed!.resources).toHaveLength(5);
  });

  it("shows a `no rules` row beside a `done` row, each saying which it is", async () => {
    const parsed = parseDumpSummary(TERMINAL_SUMMARY)!;
    await act(async () => {
      root.render(<DumpOutcomes summary={parsed} onDone={() => undefined} />);
    });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");

    expect(text).toContain("3 rules"); // done
    expect(text).toContain("read — no rules in it"); // honestly empty
    expect(text).toContain("found nothing that works as a rule"); // its reason
    expect(text).toContain("already read");
    expect(text).toContain("already holds 11 rules");

    // Never the sequence sentence over a fan-out, and never "failed" as the
    // whole account of a source that was read.
    expect(text).not.toMatch(/Nothing after it will run/);
    expect(text).not.toMatch(/Stopped —/);
    expect(text).toContain("4 sources were read");
  });

  it("renders the refusal, whole, on the source's own row", async () => {
    const parsed = parseDumpSummary(TERMINAL_SUMMARY)!;
    await act(async () => {
      root.render(<DumpOutcomes summary={parsed} onDone={() => undefined} />);
    });
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("refused");
    expect(text).toContain("is copy-protected (Adobe ADEPT)");
    expect(text).toContain("we will never strip a publisher’s protection");
    expect(text).toContain("a DRM-free copy of the same book");
    expect(text).toContain("your own highlights export");
    expect(text).toContain("the audiobook you own — we transcribe it");
  });
});
