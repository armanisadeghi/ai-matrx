/**
 * WALL W36 — "a completed run's ruling has no home on the page."
 *
 * The Expert Book Challenge's parenting trials finished two real runs and then
 * lost them. The Watson run cef6ae07 produced a regimen and a letter, the
 * Montessori run 10af94fd produced advice and a letter, and once the tab was
 * closed neither answer could be read anywhere in this product: the Masterwork
 * run box deliberately drops a terminal remembered run (wall W15), and every
 * "Recent runs" row pointed at `https://workflows.aimatrx.com/runs/{id}` — a
 * DIFFERENT host, built for the workflow's author, opened in a new tab.
 *
 * The permalink `/workflows/runs/{id}` was in this app the whole time and
 * rebuilds a finished run from the durable event log. Nothing linked to it.
 *
 * NOTHING HERE IS HAND-SHAPED. `masterwork-run-records.json` is the verbatim
 * `workflow.node_events` emission payload and `workflow.run` row for those two
 * runs plus the errored run 94d48d9c, read out of the live database.
 *
 * ONE-LINE BUGS THIS CATCHES: a run door retyped as the Studio host; a run row
 * that carries only status/time/cost; an errored row that hides the engine's
 * own sentence; a preview that leaks rule-id slugs at a reader.
 */
import React from "react";
import { renderToString } from "react-dom/server";

import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import workflowRunsReducer, {
  applyRunEvent,
  attachRun,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import { selectRunEmissions } from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import { splitByPresentation } from "@/features/workflow-runtime/kind-emissions/emission-routing";
import { presentedPreview } from "@/features/workflow-runtime/run-result/presented-result";
import { runHref } from "@/features/workflow-runtime/run-doors";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";

import records from "@/features/workflow-runtime/__tests__/fixtures/masterwork-run-records.json";
import { MasterworkRunRow } from "../MasterworksPage";
import type { MasterworkRun } from "../../../service";

const WATSON = "cef6ae07-4562-4dbd-a8e4-403309cace08";
const MONTESSORI = "10af94fd-bf7f-41c1-88ff-1098afff8351";
const BROKEN = "94d48d9c-a571-42b4-9926-fe9c248513b2";

type Records = {
  emissions: Record<string, WorkflowRunEvent[]>;
  runs: Record<
    string,
    {
      id: string;
      status: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
      steps_executed: number | null;
      error: unknown;
    }
  >;
};
const fixture = records as unknown as Records;

/** The run's real emissions, folded through the REAL reducer, as on replay. */
function emissionsOf(runId: string) {
  let state: WorkflowRunsState = workflowRunsReducer(
    undefined,
    attachRun({ runId }),
  );
  (fixture.emissions[runId] ?? []).forEach((event, index) => {
    state = workflowRunsReducer(
      state,
      applyRunEvent({ runId, event, seq: index + 1, replay: true }),
    );
  });
  return selectRunEmissions(runId)({ workflowRuns: state } as never);
}

/** Text a reader actually sees — attributes stripped, entities decoded. */
const visibleText = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

/** A MasterworkRun row exactly as `listRecentRunsForMasterworks` builds one. */
function rowFor(runId: string): MasterworkRun {
  const run = fixture.runs[runId];
  const emissions = emissionsOf(runId);
  const last = emissions[emissions.length - 1];
  const error = run.error as { message?: string } | null;
  return {
    id: run.id,
    status: run.status,
    created_at: run.created_at,
    started_at: run.started_at,
    completed_at: run.completed_at,
    steps_executed: run.steps_executed,
    cost_usd: 0.2109,
    deliverable_preview: last ? presentedPreview(last.payload) : null,
    error_message: typeof error?.message === "string" ? error.message : null,
  };
}

describe("the run that finished opens IN THIS APP", () => {
  it("points a Recent-runs row at the in-app permalink, never the Studio host", () => {
    const html = renderToString(<MasterworkRunRow run={rowFor(WATSON)} />);
    expect(html).toContain(`href="/workflows/runs/${WATSON}"`);
    expect(html).not.toContain("workflows.aimatrx.com");
    // A same-origin door navigates in place — never an escape into another app.
    expect(html).not.toContain('target="_blank"');
  });

  it("keeps `runHref` the one spelling of that address", () => {
    expect(runHref(WATSON)).toBe(`/workflows/runs/${WATSON}`);
  });
});

describe("a Recent-runs row says what the run produced", () => {
  it("carries the first line of the Watson run's real deliverable", () => {
    const row = rowFor(WATSON);
    expect(row.deliverable_preview).not.toBeNull();
    const text = visibleText(renderToString(<MasterworkRunRow run={row} />));
    // The headline finding is the first thing the regimen says.
    expect(text).toContain("The morning shoe battle and the kitchen chase");
    // Status, time and cost still ride the row.
    expect(text).toContain("completed");
    // (SSR puts a comment marker between the "$" and the number.)
    expect(text.replace(/\s+/g, "")).toContain("$0.21");
  });

  it("carries the first line of the Montessori run's real deliverable", () => {
    const row = rowFor(MONTESSORI);
    expect(row.deliverable_preview).not.toBeNull();
    expect(row.deliverable_preview!.length).toBeGreaterThan(24);
    expect(visibleText(renderToString(<MasterworkRunRow run={row} />))).toContain(
      row.deliverable_preview!.replace(/…$/, "").slice(0, 40),
    );
  });

  it("never prints a rule-id slug in the preview", () => {
    for (const runId of [WATSON, MONTESSORI]) {
      const preview = rowFor(runId).deliverable_preview ?? "";
      expect(preview).not.toMatch(/\b[a-z]+(-[a-z]+){2,}\b/);
    }
  });

  it("shows an errored run its OWN recorded sentence, not a filler line", () => {
    const row = rowFor(BROKEN);
    expect(row.error_message).toBe(
      "This step never received what the step before it was meant to hand over.",
    );
    const text = visibleText(renderToString(<MasterworkRunRow run={row} />));
    expect(text).toContain("never received what the step before it");
  });
});

describe("the permalink renders the SAME deliverable the live run showed", () => {
  it("routes the Watson run's terminal emission to the showcase slot", () => {
    const { showcase } = splitByPresentation(emissionsOf(WATSON));
    expect(showcase?.nodeId).toBe("deliver");
    const payload = showcase?.payload as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["the_regimen", "watsons_words"]);
  });

  it("renders the regimen's instructions and the letter, rule names shown and ids hidden", () => {
    const { showcase } = splitByPresentation(emissionsOf(WATSON));
    const text = visibleText(
      renderToString(<StructuredValueView value={showcase?.payload} />),
    );
    // The instructions the parent has to act on.
    expect(text).toContain(
      "Set out his shoes ten minutes before he need leave",
    );
    expect(text).toContain("Move bedtime from about 8 p.m. back to 7 p.m.");
    // The letter is handed to the renderer under its own heading. Its BODY
    // goes through the markdown pipeline, which only paints in a browser, so
    // the routed payload is where this guard reads it — the live check is the
    // preview walk recorded on W36.
    expect(text).toContain("Watsons words");
    expect(
      String((showcase?.payload as Record<string, unknown>).watsons_words),
    ).toContain("Your boy of two and a half is not stubborn");
    // Rule NAMES are the reader's handle; the slugs beside them never are
    // (peer fix 4ddae6566b, held here on the full verbatim payload).
    expect(text).toContain("Let the Child Conquer Difficulties");
    expect(text).toContain("Bedtime and Bath Schedule");
    for (const slug of [
      "let-child-conquer-difficulties",
      "bedtime-and-bath-schedule",
      "no-petting-the-raging-child",
    ]) {
      expect(text).not.toContain(slug);
    }
  });

  it("routes the Montessori run's LAST emission to the showcase — the letter the reader ended on", () => {
    const { showcase } = splitByPresentation(emissionsOf(MONTESSORI));
    expect(showcase?.nodeId).toBe("show_voice");
    const text = visibleText(
      renderToString(<StructuredValueView value={showcase?.payload} />),
    );
    expect(text).toContain("Let me tell you first what you have already seen");
  });
});
