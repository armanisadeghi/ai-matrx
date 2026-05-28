"use client";

/**
 * FloatingCaptureDemo
 *
 * Demonstrates both capture methods inside a WindowPanel — the harder case
 * because the floating panel must be hidden before the capture so it doesn't
 * appear in the screenshot, then restored afterwards.
 *
 * The panel is given the CSS class "capture-demo-panel" which is passed to
 * useScreenCapture's hideSelectors so the hook hides/restores it automatically.
 */

import React, { useState } from "react";
import {
  Camera,
  Monitor,
  Download,
  X,
  Loader2,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  useScreenCapture,
  type ScreenCaptureResult,
  type CaptureMethod,
} from "@/hooks/useScreenCapture";
import { toast } from "sonner";

const PANEL_CLASS = "capture-demo-panel";

// ─── Inner panel body ─────────────────────────────────────────────────────────

function PanelBody() {
  const [results, setResults] = useState<
    { result: ScreenCaptureResult; method: CaptureMethod }[]
  >([]);

  const { captureTab, captureScreen, isCapturing } = useScreenCapture({
    // The panel hides itself before capturing, then reappears
    hideSelectors: [`.${PANEL_CLASS}`],
    onCaptured: (result, method) => {
      setResults((prev) => [{ result, method }, ...prev].slice(0, 3));
      toast.success(
        method === "tab"
          ? "Tab captured — panel auto-hidden & restored"
          : "Screen captured — panel auto-hidden & restored",
      );
    },
    onError: (err, method) => {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") return;
      toast.error(`${method} capture failed`);
    },
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-auto min-h-0 px-4 py-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          This panel hides itself before capturing so it doesn&apos;t appear in
          the screenshot, then reappears automatically.
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => captureTab()}
            disabled={isCapturing}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-sm font-medium text-foreground transition-colors disabled:opacity-50"
          >
            {isCapturing ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Camera className="w-4 h-4 shrink-0" />
            )}
            <span className="text-left">
              {isCapturing ? "Capturing..." : "Tab Capture"}
              <span className="block text-[11px] font-normal text-muted-foreground">
                html-to-image · no picker
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => captureScreen()}
            disabled={isCapturing}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-sm font-medium text-foreground transition-colors disabled:opacity-50"
          >
            {isCapturing ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Monitor className="w-4 h-4 shrink-0" />
            )}
            <span className="text-left">
              {isCapturing ? "Capturing..." : "Screen Capture"}
              <span className="block text-[11px] font-normal text-muted-foreground">
                getDisplayMedia · browser picker
              </span>
            </span>
          </button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Results
            </p>
            {results.map(({ result, method }, i) => (
              <div
                key={`${result.file.name}-${i}`}
                className="relative rounded-lg overflow-hidden border border-border bg-muted/20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.dataUrl}
                  alt={`Capture ${i + 1}`}
                  className="w-full h-28 object-cover"
                />
                <div className="absolute top-1 right-1 flex gap-1">
                  <a
                    href={result.dataUrl}
                    download={result.file.name}
                    className="p-1 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                    title="Download"
                  >
                    <Download className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      setResults((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="p-1 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <p className="px-2 py-1 text-[10px] text-muted-foreground font-mono">
                  via {method} · {(result.file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

export function FloatingCaptureDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The floating panel hides itself before the capture fires, then
        reappears. Both methods work — the panel&apos;s CSS class is passed to{" "}
        <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
          useScreenCapture
        </code>{" "}
        as a{" "}
        <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
          hideSelector
        </code>
        .
      </p>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border border-border",
            "bg-card hover:bg-accent text-sm font-medium text-foreground transition-colors",
          )}
        >
          <FlaskConical className="w-4 h-4" />
          Open Floating Capture Window
        </button>
      )}

      {open && (
        <WindowPanel
          id="capture-demo-window"
          title="Screen Capture Demo"
          onClose={() => setOpen(false)}
          className={PANEL_CLASS}
          minWidth={300}
          minHeight={280}
          width={360}
          height={460}
        >
          <PanelBody />
        </WindowPanel>
      )}
    </div>
  );
}
