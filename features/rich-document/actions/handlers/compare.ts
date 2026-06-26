// features/rich-document/actions/handlers/compare.ts
//
// "Compare …" actions for the canonical diff system (components/diff). All
// three open the headless DiffViewer in a movable window:
//   - compare-with-clipboard : current content (base) ↔ clipboard text (incoming)
//   - set-compare-base       : pin current content as the comparison base
//   - compare-with-base      : pinned base       ↔  current content
//
// Clipboard compare direction: the current content is the OLD baseline and the
// clipboard is the NEW incoming version (the user is about to paste over what
// they have). So text only in the clipboard reads as an addition; text only in
// the current content reads as a removal. Users can flip this in the viewer.
//
// History comparison is handled by the enhanced Edit-history dialog
// (per-version "Compare" buttons), not a separate menu item.

import { Clipboard, Pin, GitCompareArrows } from "lucide-react";
import { toast } from "sonner";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  setCompareBase,
  openCompareWithBase,
} from "@/lib/redux/slices/diffCompareSlice";
import { registerAction } from "../registry";
import type { ContentSource } from "../../types";

function sourceLabel(source: ContentSource): string {
  switch (source.type) {
    case "chat-message":
      return "Message";
    case "note":
      return "Note";
    case "prompt-result":
      return "Result";
    case "artifact":
      return "Artifact";
    case "scraper-result":
      return "Scrape";
    default:
      return "Current";
  }
}

registerAction({
  id: "compare-with-clipboard",
  label: "Compare with clipboard",
  icon: Clipboard,
  iconColor: "text-sky-500 dark:text-sky-400",
  category: "edit",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 10,
  run: async (ctx) => {
    let clipboardText = "";
    try {
      clipboardText = await navigator.clipboard.readText();
    } catch {
      toast.error("Couldn't read the clipboard");
      return;
    }
    if (!clipboardText) {
      toast.info("Clipboard is empty");
      return;
    }
    const instanceId = ctx.instanceKey("diff-clipboard");
    ctx.dispatch(
      openOverlay({
        overlayId: "diffViewerWindow",
        instanceId,
        data: {
          windowInstanceId: instanceId,
          original: ctx.content,
          modified: clipboardText,
          originalLabel: sourceLabel(ctx.source),
          modifiedLabel: "Clipboard",
          title: "Compare with clipboard",
          engine: "auto",
          language: null,
          defaultView: "split",
        },
      }),
    );
  },
});

registerAction({
  id: "set-compare-base",
  label: "Set as compare base",
  icon: Pin,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "edit",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 11,
  run: (ctx) => {
    ctx.dispatch(
      setCompareBase({
        content: ctx.content,
        label: sourceLabel(ctx.source),
        language: null,
      }),
    );
    toast.success("Set as compare base", {
      description: "Open another item and choose “Compare with base”.",
    });
  },
});

registerAction({
  id: "compare-with-base",
  label: "Compare with base",
  icon: GitCompareArrows,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "edit",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 12,
  run: async (ctx) => {
    const opened = await ctx
      .dispatch(
        openCompareWithBase({
          current: ctx.content,
          currentLabel: sourceLabel(ctx.source),
        }),
      )
      .unwrap();
    if (!opened) {
      toast.info("No compare base set", {
        description: "Choose “Set as compare base” on another item first.",
      });
    }
  },
});
