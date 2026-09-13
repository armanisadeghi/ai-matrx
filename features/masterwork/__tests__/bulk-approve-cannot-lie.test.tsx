/**
 * 🚨 THE REVIEW SURFACE CANNOT LIE ABOUT WHAT WAS READ (2026-09-12).
 *
 * THE LIVE SHAPE THESE CLOSE, queried on `db.matrxserver.com`: Rulebook
 * `b4ebbfb4-…` ("Newsroom Desk") holds 416 rules in ONE section with ZERO
 * drafts — "Approve all" had fired on the whole pile — and Watson's 206 twice,
 * each recorded as a cheat. Nothing on any of those rules says so. The rules
 * that power every Masterwork built from that Rulebook are indistinguishable
 * from 416 rules a person actually read.
 *
 * Four forcing functions, each of them a guard from the design's attack:
 *
 *   GUARD 3  — a bulk approve over a selection containing a `disagrees_with`
 *              pair NAMES the pair before it fires.
 *   GUARD 3′ — the stamp it writes is `reviewed: {mode:"sampled", sample_size,
 *              of}` on every rule it touched, and the rule card RENDERS it.
 *   The default view — a Rulebook past 40 rules does not open on everything.
 *   The deletion — "Approve all" is gone from the page's source.
 *
 * How to see them go red:
 *   * `BulkApproveDialog` — delete the `bulk-approve-disagreements` block:
 *     GUARD 3 fails.
 *   * `RulebookDetailPage.RuleRow` — delete the "Approved in bulk" badge:
 *     GUARD 3′'s render half fails.
 *   * `types.stampRuled` — drop the `reviewed` spread: GUARD 3′'s stamp half
 *     fails.
 *   * Restore `approveAllDrafts`: the deletion guard fails and names it.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  heldByOneSourceOnly,
  stampRuled,
  type RulebookRule,
} from "../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/masterwork/rb-1",
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => undefined,
  useAppDispatch: () => jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { RuleRow } = require("../components/detail/RulebookDetailPage");
const {
  BulkApproveDialog,
} = require("../components/detail/BulkApproveDialog");
const { LARGE_RULEBOOK } = require("../components/detail/RulebookKpiStrip");
/* eslint-enable @typescript-eslint/no-require-imports */

const EMERGENCY: RulebookRule = {
  id: "rule-out-the-worst-first",
  name: "Rule out the worst thing first",
  section: "A",
  statement: "Order the test that rules out the fatal diagnosis before any other.",
  severity: "critical",
  draft: true,
  source_ref: { source: "url:https://example.org/emergency-desk" },
  relates_to: [
    {
      rule_id: "treat-the-likely-first",
      kind: "disagrees_with",
      condition: "in an emergency department, the first one; in primary care, the second",
    },
  ],
};

const PRIMARY_CARE: RulebookRule = {
  id: "treat-the-likely-first",
  name: "Treat the likely, then reassess",
  section: "A",
  statement: "Treat the most probable cause and bring the patient back in 48 hours.",
  severity: "critical",
  draft: true,
  source_ref: { source: "url:https://example.org/primary-care-desk" },
  relates_to: [
    {
      rule_id: "rule-out-the-worst-first",
      kind: "disagrees_with",
      condition: "in an emergency department, the first one; in primary care, the second",
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

const noop = () => {};

// ── GUARD 3 ────────────────────────────────────────────────────────────────

describe("a bulk approve names the disagreements in its selection", () => {
  it("names both sides, and the condition that separates them, before it fires", () => {
    mount(
      <BulkApproveDialog
        open
        onOpenChange={noop}
        rules={[EMERGENCY, PRIMARY_CARE]}
        pairs={[[EMERGENCY, PRIMARY_CARE]]}
        readCount="2"
        onReadCountChange={noop}
        onConfirm={noop}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("This selection contains a disagreement");
    expect(text).toContain(EMERGENCY.name);
    expect(text).toContain(PRIMARY_CARE.name);
    expect(text).toContain("in an emergency department, the first one");
  });

  it("says nothing about disagreements when the selection holds none", () => {
    mount(
      <BulkApproveDialog
        open
        onOpenChange={noop}
        rules={[EMERGENCY]}
        pairs={[]}
        readCount=""
        onReadCountChange={noop}
        onConfirm={noop}
      />,
    );
    expect(document.body.textContent ?? "").not.toContain(
      "contains a disagreement",
    );
  });

  it("tells the Expert exactly what the stamp will say before they press it", () => {
    mount(
      <BulkApproveDialog
        open
        onOpenChange={noop}
        rules={[EMERGENCY, PRIMARY_CARE]}
        pairs={[]}
        readCount="1"
        onReadCountChange={noop}
        onConfirm={noop}
      />,
    );
    expect(document.body.textContent ?? "").toContain(
      "approved in bulk, 1 of 2 read",
    );
  });
});

// ── GUARD 3′ ───────────────────────────────────────────────────────────────

describe("a bulk approve records what was actually read", () => {
  it("stamps mode, sample size and total on every rule it touched", () => {
    const stamped = stampRuled(EMERGENCY, "user-1", {
      mode: "sampled",
      sample_size: 12,
      of: 416,
    });
    expect(stamped.reviewed?.mode).toBe("sampled");
    expect(stamped.reviewed?.sample_size).toBe(12);
    expect(stamped.reviewed?.of).toBe(416);
    expect(stamped.reviewed?.by).toBe("user-1");
    expect(stamped.reviewed?.at).toBeTruthy();
    expect(stamped.ruled_by).toBe("user-1");
    expect(stamped.ruled_at).toBeTruthy();
  });

  it("a single-rule approve records that it was READ, with no sample", () => {
    const stamped = stampRuled(EMERGENCY, "user-1", { mode: "read" });
    expect(stamped.reviewed?.mode).toBe("read");
    expect(stamped.reviewed?.sample_size).toBeUndefined();
  });

  it("the rule card SAYS so, on the rule's own face", () => {
    const bulkApproved: RulebookRule = {
      ...EMERGENCY,
      draft: false,
      reviewed: { mode: "sampled", sample_size: 12, of: 416 },
    };
    mount(
      <RuleRow
        rule={bulkApproved}
        allRules={[bulkApproved]}
        canEdit
        onEdit={noop}
        onToggleRetired={noop}
        onApprove={noop}
        onReject={noop}
        onImprove={noop}
        onRequestChanges={noop}
        onReconsider={noop}
        selected={false}
        onToggleSelected={noop}
        recurrenceThreshold={null}
      />,
    );
    expect(container.textContent ?? "").toContain(
      "Approved in bulk, 12 of 416 read",
    );
  });

  it("a rule approved one at a time wears no bulk badge", () => {
    const readApproved: RulebookRule = {
      ...EMERGENCY,
      draft: false,
      reviewed: { mode: "read" },
    };
    mount(
      <RuleRow
        rule={readApproved}
        allRules={[readApproved]}
        canEdit
        onEdit={noop}
        onToggleRetired={noop}
        onApprove={noop}
        onReject={noop}
        onImprove={noop}
        onRequestChanges={noop}
        onReconsider={noop}
        selected={false}
        onToggleSelected={noop}
        recurrenceThreshold={null}
      />,
    );
    expect(container.textContent ?? "").not.toContain("Approved in bulk");
  });
});

// ── The default view, and the deletion ─────────────────────────────────────

describe("the default view is not everything", () => {
  it("finds the rules only one source holds", () => {
    const shared = { ...EMERGENCY, id: "echo", source_ref: { source: "url:b" } };
    const only = heldByOneSourceOnly([EMERGENCY, shared, PRIMARY_CARE]);
    // EMERGENCY and `echo` state the same thing from two sources — corroborated.
    expect(only.has(EMERGENCY.id)).toBe(false);
    expect(only.has("echo")).toBe(false);
    // PRIMARY_CARE's judgment nobody else states.
    expect(only.has(PRIMARY_CARE.id)).toBe(true);
  });

  it("threshold matches the server's sectioning threshold", () => {
    const sectioning = readFileSync(
      path.join(
        __dirname,
        "../../../../aidream/aidream/services/distillation/sectioning.py",
      ),
      "utf8",
    );
    const match = sectioning.match(/MAX_RULES_PER_SECTION = (\d+)/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBe(LARGE_RULEBOOK);
  });
});

describe("Approve-all is gone", () => {
  it("the page declares no no-selection bulk verb", () => {
    const source = readFileSync(
      path.join(__dirname, "../components/detail/RulebookDetailPage.tsx"),
      "utf8",
    );
    expect(source).not.toContain("const approveAllDrafts");
    expect(source).not.toContain("Approve all</Button>");
  });

  it("nothing in the feature reads the deleted evidence standing", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of require("node:fs").readdirSync(dir, {
        withFileTypes: true,
      })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (full.endsWith("bulk-approve-cannot-lie.test.tsx")) continue;
        const body = readFileSync(full, "utf8");
        if (
          body.includes("isEvidenceRule") ||
          body.includes("promoteEvidenceRule") ||
          body.includes('standing === "evidence"') ||
          body.includes('standing: "evidence"')
        ) {
          offenders.push(full);
        }
      }
    };
    walk(path.join(__dirname, ".."));
    expect(offenders).toEqual([]);
  });
});
