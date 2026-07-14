"use client";

// features/admin/app-config/components/UrlProbeField.tsx
//
// URL input with a best-effort "{url}/health" probe (5s timeout).
// Browser CORS can make a healthy server unverifiable — that outcome is
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
  | { status: "ok"; httpStatus: number }
  | { status: "fail"; detail: string }
  | { status: "cors" };

interface UrlProbeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}

export function UrlProbeField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
}: UrlProbeFieldProps) {
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const probeSeq = useRef(0);

  const runProbe = async () => {
    const seq = ++probeSeq.current;
    const base = value.trim().replace(/\/+$/, "");
    if (!base) {
      setProbe({ status: "fail", detail: "No URL to probe" });
      return;
    }
    setProbe({ status: "probing" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${base}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      if (seq !== probeSeq.current) return;
      if (res.ok) setProbe({ status: "ok", httpStatus: res.status });
      else setProbe({ status: "fail", detail: `HTTP ${res.status}` });
    } catch (err) {
      if (seq !== probeSeq.current) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        setProbe({ status: "fail", detail: "Timed out after 5s" });
      } else {
        // An opaque TypeError from fetch means the browser blocked or could
        // not complete the request — most commonly CORS on a healthy server.
        setProbe({ status: "cors" });
      }
    } finally {
      clearTimeout(timeout);
    }
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
          <CheckCircle2 className="h-3.5 w-3.5" /> Healthy — /health returned{" "}
          {probe.httpStatus}
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
