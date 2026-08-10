"use client";

/**
 * Write handlers for `matrx-user/scanner` — the receiving end of the surface's
 * `writeTargets` (declared in `features/surfaces/manifests/scanner.manifest.ts`).
 *
 * Three rules, enforced here rather than trusted to the caller:
 *
 *  1. EVERY handler validates and THROWS on a bad shape. The writeback seam
 *     (`applySurfaceWrite`) turns a throw into a loud, captured error envelope
 *     the agent reads back. A wrong value is the agent's error to hear about —
 *     never something coerced into the session so it "works" and then surprises
 *     the user at Save time.
 *  2. Nothing bypasses the canonical edit path. Titles go through
 *     `session.setLabel` and page names through `session.setItemLabel` — the
 *     exact setters the title input and the Review rename control call on every
 *     keystroke. There is no second write path into the scan manifest.
 *  3. Position, not identity, is the agent's coordinate system. The agent sees
 *     pages as an ordered array (`scan_items` / `scan_page_labels`), so the
 *     handlers translate an index to the item's local `itemId` themselves and
 *     refuse an index that is out of range. An agent must never have to know
 *     about `itemId`.
 *
 * All targets are `mode: "draft"`: they change the in-progress scan session and
 * the user still presses Save to assemble the PDF. Nothing here uploads,
 * persists, or touches the extractor pipeline.
 *
 * `session` is read through a ref rather than closed over, because a handler
 * runs at APPLY time — potentially several turns after it was registered — and
 * must see the pages as they are THEN, not as they were at the last render.
 */

import { useCallback, useRef } from "react";

import type { UseScanSessionResult } from "./useScanSession";

/**
 * Structured values arrive already parsed: the inline-tool layer JSON-parses a
 * JSON-looking argument before the handler ever sees it. A model that has been
 * burned by that once tends to "fix" it by double-encoding, so a JSON *string*
 * that parses to the expected shape is accepted here as a known failure mode
 * rather than bounced — anything that does NOT parse to the right shape still
 * throws, so this tolerates an encoding quirk without masking a wrong value.
 */
function parseStructured(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/** A label string — may be empty (that is how a page is left unlabeled). */
function requireLabel(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} expects a string label; got ${JSON.stringify(value)}.`,
    );
  }
  return value.trim();
}

export function useScannerWriteHandlers(
  session: UseScanSessionResult,
): () => Record<string, (value: unknown) => void> {
  const sessionRef = useRef(session);
  sessionRef.current = session;

  return useCallback(() => {
    return {
      scan_title: (value: unknown) => {
        if (typeof value !== "string") {
          throw new Error("scan_title expects a string.");
        }
        const title = value.trim();
        if (!title) {
          throw new Error(
            "scan_title expects a non-empty string — the saved PDF needs a name.",
          );
        }
        // Mirrors the title input's own guard: the name becomes a filename.
        if (/[\\/:*?"<>|]/.test(title)) {
          throw new Error(
            'scan_title is used as a filename, so it cannot contain \\ / : * ? " < > or |.',
          );
        }
        sessionRef.current.setLabel(title);
      },

      scan_page_labels: (value: unknown) => {
        const parsed = parseStructured(value);
        if (!Array.isArray(parsed)) {
          throw new Error(
            "scan_page_labels expects an array of label strings, one per page, in output order.",
          );
        }
        const items = sessionRef.current.items;
        if (items.length === 0) {
          throw new Error(
            "scan_page_labels cannot be applied: this scan has no captured pages yet.",
          );
        }
        if (parsed.length !== items.length) {
          throw new Error(
            `scan_page_labels expects exactly ${items.length} label${
              items.length === 1 ? "" : "s"
            } (one per captured page, in output order); got ${parsed.length}. Re-send the full list, including labels you want to keep.`,
          );
        }
        // Validate the WHOLE array before mutating anything, so a bad entry
        // halfway down cannot leave the session half-relabelled.
        const labels = parsed.map((entry, index) =>
          requireLabel(entry, `scan_page_labels[${index}]`),
        );
        labels.forEach((label, index) => {
          sessionRef.current.setItemLabel(items[index].itemId, label);
        });
      },

      scan_page_label: (value: unknown) => {
        const parsed = parseStructured(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(
            'scan_page_label expects an object { "index": <number>, "label": "<string>" }.',
          );
        }
        const { index, label } = parsed as { index?: unknown; label?: unknown };
        if (typeof index !== "number" || !Number.isInteger(index)) {
          throw new Error(
            `scan_page_label.index must be an integer page position (0-based); got ${JSON.stringify(index)}.`,
          );
        }
        const items = sessionRef.current.items;
        if (index < 0 || index >= items.length) {
          throw new Error(
            items.length === 0
              ? "scan_page_label cannot be applied: this scan has no captured pages yet."
              : `scan_page_label.index ${index} is out of range — this scan has ${items.length} page${
                  items.length === 1 ? "" : "s"
                } (valid indexes 0-${items.length - 1}).`,
          );
        }
        sessionRef.current.setItemLabel(
          items[index].itemId,
          requireLabel(label, "scan_page_label.label"),
        );
      },
    };
  }, []);
}
