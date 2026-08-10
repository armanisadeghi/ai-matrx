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
 *
 * WHERE THIS IS REGISTERED IS PART OF THE CONTRACT. These handlers are wired
 * from `DesktopReview` (`useSurfaceWriteHandlers`), the component that renders
 * the title input and the per-card "Page name" input — NOT from the provider in
 * `ScannerSurfaceRuntime`. A target is only offered to an agent where a handler
 * is registered, and the scanner's two skins render different controls: the
 * mobile capture skin has no page-rename UI at all and shows the title only
 * inside the Save sheet at commit time, so staging there would be a draft the
 * user cannot see or correct. Registering with the review also takes the
 * desktop Home view out of scope for free. Same rule, stated once: never stage
 * a value into a control that is not on screen.
 */

import { useCallback, useRef } from "react";

import {
  SCAN_PAGE_LABEL_MAX_LENGTH,
  SCAN_TITLE_MAX_LENGTH,
} from "./types";
import type { UseScanSessionResult } from "./useScanSession";

interface ScannerWriteContext {
  /**
   * True once Save runs — `ProcessingView` covers the review and the PDF's
   * name is already captured into the save stream. Handlers refuse rather than
   * staging into inputs that are gone, the way the scraper's handlers refuse
   * while a scrape is in flight.
   */
  saving: boolean;
}

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

/**
 * Every authored string on this surface lands in a ONE-LINE input, so a tab or
 * newline is refused rather than stripped — silently rewriting a value is the
 * coercion the doctrine bars, and the agent should hear about it.
 */
function requireSingleLine(value: string, target: string, max: number): string {
  if (/[\n\r\t]/.test(value)) {
    throw new Error(
      `${target} must be a single line — it is rendered in a one-line input. Remove the line breaks and tabs.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new Error(
      `${target} is ${trimmed.length} characters; the limit is ${max}.`,
    );
  }
  return trimmed;
}

/** A label string — may be empty (that is how a page is left unlabeled). */
function requireLabel(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} expects a string label; got ${JSON.stringify(value)}.`,
    );
  }
  return requireSingleLine(value, target, SCAN_PAGE_LABEL_MAX_LENGTH);
}

export function useScannerWriteHandlers(
  session: UseScanSessionResult,
  context: ScannerWriteContext,
): () => Record<string, (value: unknown) => void> {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const contextRef = useRef(context);
  contextRef.current = context;

  return useCallback(() => {
    /**
     * Shared precondition for every target: the review's inputs must actually
     * be on screen. Checked at APPLY time, not registration time.
     */
    const assertEditable = () => {
      if (contextRef.current.saving) {
        throw new Error(
          "The scan is being saved and processed — the review screen with the title and page-name inputs is no longer on display, and the saved PDF's name is already captured. No scanner metadata can be staged now.",
        );
      }
    };

    return {
      scan_title: (value: unknown) => {
        assertEditable();
        if (typeof value !== "string") {
          throw new Error("scan_title expects a string.");
        }
        const title = requireSingleLine(
          value,
          "scan_title",
          SCAN_TITLE_MAX_LENGTH,
        );
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
        assertEditable();
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
        assertEditable();
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
