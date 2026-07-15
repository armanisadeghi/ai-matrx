"use client";

// features/admin/shared/UrlProbeField.tsx
//
// URL input with a best-effort reachability probe (5s timeout).
// Two modes:
//   - "health" — GET `{url}/health` (server base URLs, app-config style)
//   - "head"   — HEAD the URL itself (artifact/download URLs, catalogs style)
// Browser CORS can make a healthy target unverifiable — that outcome is
// reported honestly as "blocked by CORS — could not verify", never as a
// failure. Probing never blocks save.

import { useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Loader2,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ProbeState =
  | { status: "idle" }
  | { status: "probing" }
  | { status: "ok"; httpStatus: number; detail?: string }
  | { status: "fail"; detail: string }
  | { status: "cors" };

export type UrlProbeMode = "health" | "head";

/** Human-readable byte size (also used by catalog tables). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return "—";
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Standalone probe used by fields AND by activation gates (kind table
 * toggle). HEAD the URL (or GET `{url}/health` in health mode); honest CORS
 * outcome. Never throws.
 */
export async function probeUrl(
  rawUrl: string,
  mode: UrlProbeMode,
): Promise<ProbeState> {
  const base = rawUrl.trim().replace(/\/+$/, "");
  if (!base) return { status: "fail", detail: "No URL to probe" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res =
      mode === "health"
        ? await fetch(`${base}/health`, {
            method: "GET",
            signal: controller.signal,
          })
        : await fetch(rawUrl.trim(), {
            method: "HEAD",
            signal: controller.signal,
          });
    if (res.ok) {
      const length = res.headers.get("content-length");
      return {
        status: "ok",
        httpStatus: res.status,
        detail:
          mode === "head" && length
            ? `${formatBytes(Number(length))} reported`
            : undefined,
      };
    }
    return { status: "fail", detail: `HTTP ${res.status}` };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "fail", detail: "Timed out after 5s" };
    }
    // An opaque TypeError from fetch means the browser blocked or could
    // not complete the request — most commonly CORS on a healthy target.
    return { status: "cors" };
  } finally {
    clearTimeout(timeout);
  }
}

interface UrlProbeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  /** "health" (default) GETs `{url}/health`; "head" HEADs the URL itself. */
  mode?: UrlProbeMode;
}

export function UrlProbeField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  mode = "health",
}: UrlProbeFieldProps) {
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const probeSeq = useRef(0);

  const runProbe = async () => {
    const seq = ++probeSeq.current;
    setProbe({ status: "probing" });
    const result = await probeUrl(value, mode);
    if (seq !== probeSeq.current) return;
    setProbe(result);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setProbe({ status: "idle" });
          }}
          placeholder={placeholder ?? "https://…"}
          className={cn("font-mono text-sm", error && "border-destructive")}
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void runProbe()}
          disabled={probe.status === "probing" || value.trim().length === 0}
          className="shrink-0"
        >
          {probe.status === "probing" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Activity className="mr-1.5 h-3.5 w-3.5" />
          )}
          Probe
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {probe.status === "ok" ? (
        <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />{" "}
          {mode === "health"
            ? `Healthy — /health returned ${probe.httpStatus}`
            : `Reachable — HEAD returned ${probe.httpStatus}${probe.detail ? ` (${probe.detail})` : ""}`}
        </p>
      ) : null}
      {probe.status === "fail" ? (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" /> Probe failed — {probe.detail}
        </p>
      ) : null}
      {probe.status === "cors" ? (
        <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <ShieldQuestion className="h-3.5 w-3.5" /> Blocked by CORS — could
          not verify from the browser
        </p>
      ) : null}
    </div>
  );
}
