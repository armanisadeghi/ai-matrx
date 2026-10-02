/**
 * Opening a value in a sent message's context shows what the MODEL read for
 * it — the receipt's `delivered` / `server_rendered` text, verbatim — never
 * the page's pre-send copy (RULES.md §5; Arman, 2026-10-01: the Organization
 * row showed the page's switcher value while the server told the model the
 * conversation's own organization).
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContextReceiptData } from "@host/types/python-generated/stream-events";
import { MessageContextReceiptTable } from "../MessageContextReceipt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ELEMENT =
  '    <object key="organization" label="Organization" format="json">\n{\n  "id": "f9cb3e35",\n  "name": "Titanium"\n}\n    </object>';
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
      origin: "client",
      chars: 48,
      include: true,
      max_inline_chars: 200,
      delivery: "inline",
      decided_by: { include: "default", max_inline_chars: "default" },
      user_rule: null,
      clamped: false,
      client_sent_excluded: false,
      blocked_by: null,
      delivered: { text: ELEMENT, chars: ELEMENT.length, truncated: false, sha256: "a" },
      server_rendered: { text: STATED, chars: STATED.length, truncated: false, sha256: "b" },
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

it("opening a row shows the text the agent received, both the value and the server's own", () => {
  act(() => root.render(<MessageContextReceiptTable receipt={RECEIPT} />));
  expect(host.querySelector('[data-testid="context-delivered-text"]')).toBeNull();
  const open = [...host.querySelectorAll("button")].find((b) => b.textContent === "Organization")!;
  act(() => open.click());
  const texts = [...host.querySelectorAll('[data-testid="context-delivered-text"]')].map(
    (el) => el.textContent,
  );
  expect(texts).toEqual([ELEMENT, STATED]);
  expect(host.querySelector('section[aria-label="Agent received"]')).not.toBeNull();
  expect(host.querySelector('section[aria-label="Agent also received"]')).not.toBeNull();
});
