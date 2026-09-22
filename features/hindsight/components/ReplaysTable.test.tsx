/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";

import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";

import { TooltipProvider } from "@/components/ui/tooltip";

function renderToStaticMarkup(node: ReactNode) {
  return renderMarkup(<TooltipProvider>{node}</TooltipProvider>);
}

import type { Replay } from "../types";
import { ReplaysTable, replayColumns } from "./ReplaysTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<Replay> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<Replay>) => {
    tableProps = props;
    return null;
  },
}));

const completeReplay: Replay = {
  id: "replay-complete",
  enrollment_id: "enrollment-1",
  variant: "candidate",
  status: "completed",
  metrics: { cost: 0 },
  original_metrics: { cost: 0.004 },
  verdict: "better",
  judge: {
    reasoning: "The replay used fewer tokens and preserved the answer.",
  },
  source_conversation_id: "original-conversation",
  replay_conversation_id: "replay-conversation",
  created_at: "2026-09-22T12:00:00Z",
};

function column(id: string) {
  const found = replayColumns("product").find(
    (candidate) => candidate.id === id,
  );
  if (!found) throw new Error(`Missing ${id} column`);
  return found;
}

describe("ReplaysTable canonical replay evidence", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses one canonical table with its own title, toolbar, and footer", () => {
    act(() => root.render(<ReplaysTable replays={[completeReplay]} />));
    if (!tableProps) throw new Error("Replay evidence table did not render");

    expect(tableProps.tableId).toBe("hindsight/replays");
    expect(tableProps.toolbar).toMatchObject({
      title: "Replay evidence",
      search: true,
    });
    expect(tableProps.pageSize).toBe(10);
    expect(tableProps.defaultSort).toEqual({
      id: "created-at",
      direction: "desc",
    });
    expect(tableProps.coverage).toBeUndefined();
  });

  it("keeps every audit field independent, sortable, and filterable", () => {
    expect(replayColumns("admin").map((candidate) => candidate.id)).toEqual([
      "status",
      "verdict",
      "replay-cost",
      "original-cost",
      "outcome",
      "original",
      "replay",
      "created-at",
    ]);

    for (const id of [
      "status",
      "verdict",
      "replay-cost",
      "original-cost",
      "outcome",
      "original",
      "replay",
      "created-at",
    ]) {
      const candidate = column(id);
      expect(candidate.filter).not.toBe(false);
      expect(candidate.accessorKey ?? candidate.accessorFn).toBeDefined();
    }
  });

  it("keeps real zero spend distinct from unrun and missing baseline values", () => {
    const replayCost = column("replay-cost");
    const originalCost = column("original-cost");
    const failed = {
      ...completeReplay,
      id: "replay-failed",
      status: "failed",
      metrics: { cost: 99 },
      original_metrics: { cost: 4 },
      error: { message: "\u001b[91m---- worker refused ----" },
    } satisfies Replay;

    expect(replayCost.accessorFn?.(completeReplay)).toBe(0);
    expect(originalCost.accessorFn?.(completeReplay)).toBe(0.004);
    expect(replayCost.accessorFn?.(failed)).toBeNull();
    expect(originalCost.accessorFn?.(failed)).toBeNull();
    expect(renderToStaticMarkup(<>{replayCost.cell?.(failed, 0)}</>)).toContain(
      "nothing spent — it never reached the model",
    );
    expect(
      renderToStaticMarkup(<>{originalCost.cell?.(failed, 0)}</>),
    ).toContain("nothing to compare");
  });

  it("keeps queued and processing replays in flight instead of calling them failures", () => {
    const status = column("status");
    const queued = {
      ...completeReplay,
      id: "queued",
      status: "pending",
    } satisfies Replay;
    const running = {
      ...completeReplay,
      id: "running",
      status: "processing",
    } satisfies Replay;

    expect(status.accessorFn?.(queued)).toBe("queued");
    expect(status.accessorFn?.(running)).toBe("running");
    expect(renderToStaticMarkup(<>{status.cell?.(queued, 0)}</>)).toContain(
      "queued",
    );
    expect(renderToStaticMarkup(<>{status.cell?.(running, 0)}</>)).toContain(
      "running",
    );
  });

  it("makes the full outcome and audience-correct transcript doors available", () => {
    const outcome = column("outcome");
    const original = column("original");
    const replay = column("replay");
    const failed = {
      ...completeReplay,
      id: "failed-with-reason",
      status: "failed",
      error: { message: "the replay exhausted its worker lease" },
    } satisfies Replay;

    expect(outcome.accessorFn?.(failed)).toBe(
      "the replay exhausted its worker lease",
    );
    expect(
      renderToStaticMarkup(<>{outcome.cell?.(completeReplay, 0)}</>),
    ).toContain(
      'The replay used fewer tokens and preserved the answer.',
    );
    expect(
      renderToStaticMarkup(<>{original.cell?.(completeReplay, 0)}</>),
    ).toContain("/chat/original-conversation");
    expect(
      renderToStaticMarkup(<>{replay.cell?.(completeReplay, 0)}</>),
    ).toContain("/chat/replay-conversation");

    const workflowReplay = {
      ...completeReplay,
      id: "workflow-replay",
      source_conversation_id: null,
      replay_conversation_id: null,
      source_wf_run_id: "original-run",
      replay_wf_run_id: "replay-run",
    } satisfies Replay;
    expect(
      renderToStaticMarkup(<>{original.cell?.(workflowReplay, 0)}</>),
    ).toContain("/workflows/runs/original-run");
    expect(
      renderToStaticMarkup(<>{replay.cell?.(workflowReplay, 0)}</>),
    ).toContain("/workflows/runs/replay-run");

    act(() => root.render(<ReplaysTable replays={[failed]} />));
    if (!tableProps?.detail?.render) {
      throw new Error("Replay evidence detail did not render");
    }
    expect(
      renderToStaticMarkup(
        <>
          {tableProps.detail.render(failed, {
            closeDetail: jest.fn(),
            openDetail: jest.fn(),
            openWindow: jest.fn(),
            closeWindow: jest.fn(),
            hasPendingEdits: false,
            discardPendingEdits: jest.fn(),
          })}
        </>,
      ),
    ).toContain("the replay exhausted its worker lease");
  });
});
