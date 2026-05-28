"use client";

import React, { useState } from "react";
import { Camera, Monitor, X, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useScreenCapture,
  captureTabViaCanvas,
  captureViaDisplayMedia,
  type ScreenCaptureResult,
  type CaptureMethod,
} from "@/hooks/useScreenCapture";
import { toast } from "sonner";

// ─── Shared preview card ─────────────────────────────────────────────────────

function PreviewCard({
  result,
  onClear,
}: {
  result: ScreenCaptureResult;
  onClear: () => void;
}) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-border bg-muted/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={result.dataUrl}
        alt="Captured screenshot"
        className="w-full h-auto max-h-80 object-contain bg-black/5"
      />
      <div className="absolute top-2 right-2 flex gap-1.5">
        <a
          href={result.dataUrl}
          download={result.file.name}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
        >
          <Download className="w-3 h-3" />
          Save
        </a>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-muted-foreground font-mono">
        {result.file.name} · {(result.file.size / 1024).toFixed(0)} KB ·{" "}
        {result.dataUrl.length > 0 ? "ready" : ""}
      </p>
    </div>
  );
}

// ─── CaptureButton ────────────────────────────────────────────────────────────

function CaptureButton({
  onClick,
  disabled,
  loading,
  icon: Icon,
  label,
  loadingLabel,
  description,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: typeof Camera;
  label: string;
  loadingLabel: string;
  description: string;
  variant?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex items-start gap-3 w-full px-4 py-3 rounded-xl border text-left transition-colors disabled:opacity-50",
        variant === "accent"
          ? "border-primary/30 bg-primary/5 hover:bg-primary/10 text-foreground"
          : "border-border bg-card hover:bg-accent text-foreground",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <Icon className="w-4 h-4 text-muted-foreground" />
        )}
      </span>
      <div>
        <p className="text-sm font-medium">{loading ? loadingLabel : label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}

// ─── Section 1: Inline (direct on page) ──────────────────────────────────────

export function InlineDemo({ hideSelectors }: { hideSelectors?: string[] }) {
  const [results, setResults] = useState<
    { result: ScreenCaptureResult; method: CaptureMethod }[]
  >([]);

  const { captureTab, captureScreen, isCapturing } = useScreenCapture({
    hideSelectors,
    onCaptured: (result, method) => {
      setResults((prev) => [{ result, method }, ...prev]);
      toast.success(
        method === "tab"
          ? "Tab captured via html-to-image"
          : "Screen captured via getDisplayMedia",
      );
    },
    onError: (err, method) => {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") return;
      toast.error(`${method} capture failed`);
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CaptureButton
          onClick={() => captureTab()}
          loading={isCapturing}
          disabled={isCapturing}
          icon={Camera}
          label="Tab Capture (html-to-image)"
          loadingLabel="Capturing tab..."
          description="Silently re-paints the DOM. No picker. May miss backdrop-filter and canvas content."
        />
        <CaptureButton
          onClick={() => captureScreen()}
          loading={isCapturing}
          disabled={isCapturing}
          icon={Monitor}
          label="Screen Capture (getDisplayMedia)"
          loadingLabel="Waiting for picker..."
          description="Native browser picker. Pixel-perfect. Current tab is pre-selected."
          variant="accent"
        />
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(({ result, method }, i) => (
            <div key={`${result.file.name}-${i}`}>
              <p className="text-[11px] text-muted-foreground font-mono mb-1">
                #{results.length - i} via {method}
              </p>
              <PreviewCard
                result={result}
                onClear={() =>
                  setResults((prev) => prev.filter((_, j) => j !== i))
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 2: Standalone primitives (no hook) ───────────────────────────────

export function PrimitivesDemo() {
  const [loading, setLoading] = useState<CaptureMethod | null>(null);
  const [result, setResult] = useState<ScreenCaptureResult | null>(null);

  const runTab = async () => {
    setLoading("tab");
    try {
      const r = await captureTabViaCanvas();
      setResult(r);
      toast.success("Captured via captureTabViaCanvas()");
    } catch {
      toast.error("Tab capture failed");
    } finally {
      setLoading(null);
    }
  };

  const runScreen = async () => {
    setLoading("screen");
    try {
      const r = await captureViaDisplayMedia();
      setResult(r);
      toast.success("Captured via captureViaDisplayMedia()");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        toast.error("Screen capture failed");
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Calling the exported async functions directly — no hook, no React state
        wrapper.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CaptureButton
          onClick={runTab}
          loading={loading === "tab"}
          disabled={loading !== null}
          icon={Camera}
          label="captureTabViaCanvas()"
          loadingLabel="Capturing..."
          description="Standalone async function. Import anywhere."
        />
        <CaptureButton
          onClick={runScreen}
          loading={loading === "screen"}
          disabled={loading !== null}
          icon={Monitor}
          label="captureViaDisplayMedia()"
          loadingLabel="Waiting..."
          description="Standalone async function. Import anywhere."
          variant="accent"
        />
      </div>
      {result && (
        <PreviewCard result={result} onClear={() => setResult(null)} />
      )}
    </div>
  );
}
