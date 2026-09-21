/**
 * 🚨 THE CENSUS: every Masterwork surface that shows a server refusal reads it
 * the same way, and none of them offers a retry the server already refused.
 *
 * ## The defect this guards (fifteenth cold walk, 2026-09-20, blocking C)
 *
 * One missing import — `origin_override_for` from
 * `aidream.services.conversation_context.scope` — took down five surfaces at
 * once. aidream answered every one of them with its `build_defect` envelope,
 * which is the most honest sentence in the product: it owns the fault, says
 * retrying cannot help, and says nothing was lost.
 *
 * Then the screens threw that away:
 *
 *   Understudy : "Try again, or reload the page; it costs nothing and takes a
 *                 second."  (with a live Try again button)
 *   Your words : "We couldn't load your words right now. Nothing is lost —
 *                 try again."  (same)
 *   Bench      : the server's sentence verbatim, module path and 32-hex trace
 *                 id included, then "reload to try again".
 *   Run box    : the ONE that got it right — because someone wrote that
 *                 sentence by hand.
 *
 * A habit in one file is not a rule. This asserts the rule over the REAL
 * seams each surface renders from, with the REAL envelope production sent.
 */

import fs from "node:fs";
import path from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import { checkFailed } from "@/features/masterwork/encore/benchProof";
import { explainRunFailure } from "@/features/workflow-runtime/run-failure-explanation";
import {
  namesAModulePath,
  namesATraceId,
} from "@/lib/progress/failureSentence";

jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TRACE_ID = "9f2c1d4ab8e7460fa1c3d5e6b7889900";

/** Verbatim, from the walk's capture of `POST /masterworks/understudy/refresh`. */
const USER_MESSAGE =
  "This part of the server was built wrong and cannot run: it is missing " +
  "'origin_override_for' from aidream.services.conversation_context.scope. " +
  "That is our defect, not anything you did, and trying again will fail the " +
  `same way until it is fixed. It was recorded as ${TRACE_ID} so it can be ` +
  "traced. Nothing you sent was changed or lost.";

const ENVELOPE = {
  error: "build_defect",
  message: "Internal server error: ImportError",
  user_message: USER_MESSAGE,
  request_id: TRACE_ID,
};

const API_ERROR = {
  type: "http_error" as const,
  status: 500,
  message: USER_MESSAGE,
  serverDetail: ENVELOPE,
};

/** What a sentence must never contain once a person can read it. */
function assertCleanSentence(text: string): void {
  expect(text).not.toContain("aidream.services.conversation_context.scope");
  expect(namesAModulePath(text)).toBe(false);
  expect(namesATraceId(text)).toBe(false);
}

/** The retry prompts the walk actually read on screen. */
const REFUSED_RETRY_PROMPTS = [
  /try again, or reload/i,
  /it costs nothing/i,
  /reload to try again/i,
  /press run it again/i,
];

function assertNoRetryPrompt(text: string): void {
  for (const shape of REFUSED_RETRY_PROMPTS) {
    expect(text).not.toMatch(shape);
  }
}

describe("the bench — Bench proof and Run the Bench share one reason", () => {
  it("prints neither the module path nor the trace id, and offers no reload", () => {
    const state = checkFailed(API_ERROR);
    expect(state.status).toBe("unavailable");
    if (state.status !== "unavailable") throw new Error("unreachable");

    assertCleanSentence(state.reason);
    assertNoRetryPrompt(state.reason);
    expect(state.retryIsPointless).toBe(true);
    // Kept, because it is genuinely useful when she reports this — in the
    // muted detail slot the panel renders separately, never in the prose.
    expect(state.traceId).toBe(TRACE_ID);
  });

  it("still tells an ordinary read failure to reload", () => {
    const state = checkFailed("Select an organization before sending this request.");
    if (state.status !== "unavailable") throw new Error("unreachable");
    expect(state.reason).toContain("reload to try again");
    expect(state.retryIsPointless).toBe(false);
  });
});

describe("the run box — DurableRunFailure, every durable run surface at once", () => {
  let host: HTMLDivElement;
  let root: Root;

  const mount = (element: React.ReactElement): string => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(element);
    });
    return host.textContent ?? "";
  };

  const buttons = (): string[] =>
    [...host.querySelectorAll("button")].map((b) => b.textContent ?? "");

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows the server's remedy and no Try it again button", () => {
    const text = mount(
      <DurableRunFailure
        error={USER_MESSAGE}
        retry={async () => undefined}
        running={false}
      />,
    );

    expect(text).toContain("trying again will fail the same way");
    assertCleanSentence(text.replace(TRACE_ID, ""));
    expect(text).toContain(TRACE_ID); // the muted "Recorded as …" line
    expect(buttons().join(" ")).not.toMatch(/try it again/i);
  });

  it("keeps the button for a failure that might actually clear", () => {
    mount(
      <DurableRunFailure
        error="The AI provider was too busy at that moment."
        retry={async () => undefined}
        running={false}
      />,
    );
    expect(buttons().join(" ")).toMatch(/try it again/i);
  });
});

describe("the run plan — explainRunFailure never invents a retry over a refusal", () => {
  it("replaces its next step with the server's own remedy", () => {
    const explanation = explainRunFailure(
      // A cause this client does not know, which is the path that used to end
      // on "Press Run it again."
      { cause: "some_cause_shipped_after_this_bundle", message: USER_MESSAGE },
      "Your Masterwork",
    );
    assertCleanSentence(explanation.nextStep);
    assertNoRetryPrompt(explanation.nextStep);
    expect(explanation.nextStep).toContain("fail the same way");
  });

  it("leaves a retryable cause exactly as it was", () => {
    const explanation = explainRunFailure(
      { cause: "rate_limited", message: "The provider was too busy." },
      "Your Masterwork",
    );
    expect(explanation.nextStep).toContain("Run it again");
  });
});

describe("the census — no Masterwork refusal surface reads a failure its own way", () => {
  /**
   * The surfaces the walk found, by the file that decides their sentence.
   * A new one belongs on this list; a file that stops routing through the
   * shared reading fails here rather than in front of an Expert.
   */
  const SURFACES = [
    // Understudy box (its ledger writes the sentence the card renders).
    "features/masterwork/understudy/refresh.ts",
    // "Your words".
    "features/masterwork/record/ExpertRecordPage.tsx",
    // Bench proof + Run the Bench.
    "features/masterwork/encore/benchProof.ts",
    // The run box, for every durable run surface.
    "lib/durable-run/DurableRunFailure.tsx",
    // The run plan's explanation.
    "features/workflow-runtime/run-failure-explanation.ts",
    // The pile outcome's per-source line.
    "features/masterwork/durable-run/ingestProgress.ts",
  ];

  const root = path.resolve(__dirname, "../../..");

  it.each(SURFACES)("%s routes through lib/progress/failureSentence", (rel) => {
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    expect(source).toMatch(
      /from "@\/lib\/progress\/failureSentence"/,
    );
    expect(source).toMatch(/serverRefusal|retryIsPointless/);
  });

  it.each([
    "features/masterwork/understudy/UnderstudyCard.tsx",
    "features/masterwork/record/ExpertRecordPage.tsx",
    "lib/durable-run/DurableRunFailure.tsx",
  ])("%s hides its retry control when the server refused", (rel) => {
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    expect(source).toMatch(/retryIsPointless/);
  });
});
