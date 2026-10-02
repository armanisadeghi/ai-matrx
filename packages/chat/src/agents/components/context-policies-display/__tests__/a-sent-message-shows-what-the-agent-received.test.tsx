/**
 * Opening a value in a sent message's context shows what the MODEL read for
 * it — fetched from the viewer when opened, never pushed (RULES.md §5/§5b) —
 * never the page's pre-send copy (Arman, 2026-10-01: the Organization row
 * showed the page's switcher value while the server told the model the
 * conversation's own organization). Organization is server-owned (§5a): it is
 * the server's whole `<active_context>` statement AND the organization catalog
 * the model read with it; every other block of server text is under "Also sent".
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContextReceiptData } from "@host/types/python-generated/stream-events";
import { MessageContextReceiptTable } from "../MessageContextReceipt";
import type { ContextViewTarget, ContextViewedText } from "@ai-matrx/agents/context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATED =
  '<active_context>\n  <organization id="c41f9e20">Harbor Point Property Management</organization>\n</active_context>';
const CATALOG = "<org_catalog>\n  Harbor Point Property Management\n</org_catalog>";
const SANDBOX = "<sandbox_briefing>\n  Box sbx-4b is armed.\n</sandbox_briefing>";
/** What `scope_system` returns now for the selected scope — tool-returnable, never inline. */
const FETCHED =
  'scope_system(action="expand_scope", scope_slug="marina", scope_type_slug="properties") returns:\n<scope slug="marina">gate_code: 4471</scope>';

const RECEIPT: ContextReceiptData = {
  type: "context_receipt",
  version: 1,
  surface: null,
  cap: 50000,
  model_reads_context: true,
  rules_error: null,
  rows: [
    {
      key: "organization",
      label: "Organization",
      surface_key: "_default",
      origin: "server",
      chars: 40,
      include: true,
      max_inline_chars: 200,
      delivery: "inline",
      decided_by: { include: "default", max_inline_chars: "default" },
      user_rule: null,
      clamped: false,
      client_sent_excluded: false,
      blocked_by: null,
      delivered: { chars: STATED.length, sha256: "b" },
    },
  ],
  blocks: [
    { id: "organization_catalog", label: "Organization Catalog", delivered: { chars: CATALOG.length, sha256: "c" } },
    { id: "sandbox_briefing", label: "Sandbox Briefing", delivered: { chars: SANDBOX.length, sha256: "d" } },
  ],
};

const TEXTS: Record<string, string> = {
  "delivered:organization": STATED,
  "block:organization_catalog": CATALOG,
  "block:sandbox_briefing": SANDBOX,
  "fetchable:organization": FETCHED,
};

let host: HTMLDivElement;
let root: Root;
let calls: string[];

const load = async (target: ContextViewTarget): Promise<ContextViewedText> => {
  calls.push(`${target.kind}:${target.key}`);
  const text = TEXTS[`${target.kind}:${target.key}`];
  if (text === undefined) throw new Error("Not retained");
  return {
    ...target,
    text,
    chars: text.length,
    sha256: "x",
    source: target.kind === "fetchable" ? "fetched_now" : "wire",
  };
};

beforeEach(() => {
  calls = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

const texts = () =>
  [...host.querySelectorAll('[data-testid="context-delivered-text"]')].map((el) => el.textContent);

it("nothing is fetched until a value is opened; the receipt carries no text", () => {
  act(() => root.render(<MessageContextReceiptTable receipt={RECEIPT} load={load} />));
  expect(calls).toEqual([]);
  expect(JSON.stringify(RECEIPT)).not.toContain("Harbor Point");
});

it("opening Organization fetches the server's statement, the catalog it rode with, and what the agent can fetch", async () => {
  act(() => root.render(<MessageContextReceiptTable receipt={RECEIPT} load={load} />));
  const open = [...host.querySelectorAll("button")].find((b) => b.textContent === "Organization")!;
  act(() => open.click());
  await flush();
  expect(texts()).toEqual([STATED, CATALOG, FETCHED]);
  expect(calls).toEqual([
    "delivered:organization",
    "block:organization_catalog",
    "fetchable:organization",
  ]);
  // The scope values are what the agent CAN fetch (scope_system), labelled so and sized once
  // loaded — never under "Agent received".
  const fetchable = host.querySelector('section[aria-label="Agent can fetch"]')!;
  expect(fetchable.textContent).toContain(`${FETCHED.length} chars`);
  expect(host.querySelector('section[aria-label="Agent received"]')!.textContent).not.toContain("4471");
  expect(host.textContent).not.toContain("Titanium");
  expect(host.querySelector('section[aria-label="Agent received"]')).not.toBeNull();
  // The catalog is the Organization's — "Also sent" lists only the other block.
  const also = host.querySelector('[aria-label="Also sent"]')!;
  expect(also.textContent).toContain("Sandbox Briefing");
  expect(also.textContent).not.toContain("Organization Catalog");
});

it("an Also-sent block opens to its exact text", async () => {
  act(() => root.render(<MessageContextReceiptTable receipt={RECEIPT} load={load} />));
  const open = [...host.querySelectorAll("button")].find((b) => b.textContent === "Sandbox Briefing")!;
  act(() => open.click());
  await flush();
  expect(texts()).toEqual([SANDBOX]);
});

it("a refusal is said, with a retry — never an empty box", async () => {
  const refusing = async (): Promise<ContextViewedText> => {
    calls.push("refused");
    throw new Error("Not retained");
  };
  act(() => root.render(<MessageContextReceiptTable receipt={RECEIPT} load={refusing} />));
  const open = [...host.querySelectorAll("button")].find((b) => b.textContent === "Sandbox Briefing")!;
  act(() => open.click());
  await flush();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Not retained");
  expect(texts()).toEqual([]);
});

it("nothing selected to fetch says None — never an empty box", async () => {
  const none = async (target: ContextViewTarget): Promise<ContextViewedText> =>
    target.kind === "fetchable"
      ? { ...target, text: "", chars: 0, sha256: "e3b0", source: "fetched_now" }
      : load(target);
  act(() => root.render(<MessageContextReceiptTable receipt={RECEIPT} load={none} />));
  const open = [...host.querySelectorAll("button")].find((b) => b.textContent === "Organization")!;
  act(() => open.click());
  await flush();
  const fetchable = host.querySelector('section[aria-label="Agent can fetch"]')!;
  expect(fetchable.querySelector('[data-testid="context-delivered-empty"]')?.textContent).toBe("None");
});

it("an agent that cannot fetch says so and shows nothing as fetchable (Arman, 2026-10-02)", async () => {
  const off = async (target: ContextViewTarget): Promise<ContextViewedText> =>
    target.kind === "fetchable"
      ? { ...target, text: "", chars: 0, sha256: "e3b0", source: "fetched_now", available: false }
      : load(target);
  act(() => root.render(<MessageContextReceiptTable receipt={RECEIPT} load={off} />));
  const open = [...host.querySelectorAll("button")].find((b) => b.textContent === "Organization")!;
  act(() => open.click());
  await flush();
  const fetchable = host.querySelector('section[aria-label="Agent can fetch"]')!;
  expect(
    fetchable.querySelector('[data-testid="context-delivered-unavailable"]')?.textContent,
  ).toBe("Not available to this agent");
  expect(fetchable.querySelector('[data-testid="context-delivered-text"]')).toBeNull();
  expect(fetchable.querySelector('[data-testid="context-delivered-empty"]')).toBeNull();
  expect(fetchable.textContent).not.toContain("chars");
});
