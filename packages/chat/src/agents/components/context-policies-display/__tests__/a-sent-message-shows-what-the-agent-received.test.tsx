/**
 * Opening a value in a sent message's context shows what the MODEL read for
 * it — the receipt's `delivered` text, verbatim — never the page's pre-send
 * copy (RULES.md §5; Arman, 2026-10-01: the Organization row showed the page's
 * switcher value while the server told the model the conversation's own
 * organization). Organization is server-owned (§5a): what was delivered is
 * the server's own `<organization>` element, origin server.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContextReceiptData } from "@host/types/python-generated/stream-events";
import { MessageContextReceiptTable } from "../MessageContextReceipt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATED = '  <organization id="c41f9e20">Harbor Point Property Management</organization>';

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
      chars: STATED.length,
      include: true,
      max_inline_chars: 200,
      delivery: "inline",
      decided_by: { include: "default", max_inline_chars: "default" },
      user_rule: null,
      clamped: false,
      client_sent_excluded: false,
      blocked_by: null,
      delivered: { text: STATED, chars: STATED.length, truncated: false, sha256: "b" },
    },
  ],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("opening a row shows the text the agent received — the server's own organization", () => {
  act(() => root.render(<MessageContextReceiptTable receipt={RECEIPT} />));
  expect(host.querySelector('[data-testid="context-delivered-text"]')).toBeNull();
  const open = [...host.querySelectorAll("button")].find((b) => b.textContent === "Organization")!;
  act(() => open.click());
  const texts = [...host.querySelectorAll('[data-testid="context-delivered-text"]')].map(
    (el) => el.textContent,
  );
  expect(texts).toEqual([STATED]);
  expect(host.textContent).not.toContain("Titanium");
  expect(host.querySelector('section[aria-label="Agent received"]')).not.toBeNull();
});
