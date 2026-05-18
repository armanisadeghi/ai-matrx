"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  X,
  GripVertical,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AiProvider, ProviderModelEntry } from "../types";
import Link from "next/link";

type Position = { x: number; y: number };

type Props = {
  providers: AiProvider[];
  onClose: () => void;
};

function CapabilityNode({
  label,
  value,
  depth = 0,
}: {
  label: string;
  value: unknown;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);

  if (value === null || value === undefined) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className="text-xs">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span className="font-medium text-foreground">{label}</span>
        </button>
        {open && (
          <div className="ml-4 border-l pl-2 mt-1 space-y-1">
            {entries.map(([k, v]) => (
              <CapabilityNode key={k} label={k} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const displayValue =
    typeof value === "boolean" ? (
      <Badge
        variant={value ? "default" : "secondary"}
        className="h-4 px-1 text-[10px]"
      >
        {value ? "yes" : "no"}
      </Badge>
    ) : (
      <span className="text-muted-foreground">{String(value)}</span>
    );

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-foreground/70">{label}:</span>
      {displayValue}
    </div>
  );
}

function ModelCard({ model }: { model: ProviderModelEntry }) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (d?: string) => {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">
            {model.display_name ?? model.id}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            {model.id}
          </p>
        </div>
        {model.created_at && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatDate(model.created_at)}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/20 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {model.max_input_tokens != null && (
              <div className="text-xs">
                <span className="text-muted-foreground">Context: </span>
                <span className="font-mono">
                  {model.max_input_tokens.toLocaleString()}
                </span>
              </div>
            )}
            {model.max_tokens != null && (
              <div className="text-xs">
                <span className="text-muted-foreground">Max output: </span>
                <span className="font-mono">
                  {model.max_tokens.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {model.capabilities && typeof model.capabilities === "object" && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Capabilities
              </p>
              <div className="space-y-1">
                {Object.entries(
                  model.capabilities as Record<string, unknown>,
                ).map(([k, v]) => (
                  <CapabilityNode key={k} label={k} value={v} depth={0} />
                ))}
              </div>
            </div>
          )}

          {/* Any extra fields not covered above */}
          {Object.entries(model)
            .filter(
              ([k]) =>
                ![
                  "id",
                  "display_name",
                  "created_at",
                  "type",
                  "max_input_tokens",
                  "max_tokens",
                  "capabilities",
                ].includes(k),
            )
            .map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-muted-foreground">{k}: </span>
                <span className="font-mono text-[11px]">
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ProviderTab({ provider }: { provider: AiProvider }) {
  const cache = provider.provider_models_cache;

  if (!cache) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">No data cached</p>
          <p className="text-xs text-muted-foreground mt-1">
            Sync this provider to fetch their model list
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/administration/ai-models/provider-sync">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Go to Provider Sync
          </Link>
        </Button>
      </div>
    );
  }

  const { models, fetched_at } = cache;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {models.length} models
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            Synced {new Date(fetched_at).toLocaleString()}
          </span>
        </div>
        {provider.models_link && (
          <a
            href={provider.models_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            Official docs
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="space-y-1.5">
        {models.map((m) => (
          <ModelCard key={m.id} model={m} />
        ))}
      </div>
    </div>
  );
}

export default function ProviderReferenceModal({ providers, onClose }: Props) {
  const [activeProviderId, setActiveProviderId] = useState<string>(
    providers[0]?.id ?? "",
  );
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{
    mx: number;
    my: number;
    px: number;
    py: number;
  } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize position: right side of screen, vertically centered
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const modalW = 520;
    const modalH = Math.min(600, h * 0.75);
    setPosition({ x: w - modalW - 24, y: (h - modalH) / 2 });
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        px: position.x,
        py: position.y,
      };
      setIsDragging(true);
    },
    [position],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setPosition({
        x: dragStart.current.px + dx,
        y: dragStart.current.py + dy,
      });
    };

    const onUp = () => {
      setIsDragging(false);
      dragStart.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const activeProvider =
    providers.find((p) => p.id === activeProviderId) ?? providers[0];

  const modal = (
    <div
      ref={modalRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: 520,
        height: "min(600px, 75vh)",
        zIndex: 9999,
      }}
      className="flex flex-col bg-card border rounded-lg shadow-2xl overflow-hidden"
    >
      {/* Drag handle / header */}
      <div
        onMouseDown={onMouseDown}
        className={`flex items-center gap-2 px-3 py-2 bg-muted/60 border-b cursor-grab select-none shrink-0 ${isDragging ? "cursor-grabbing" : ""}`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold flex-1">Provider Reference</span>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Link href="/administration/ai-models/provider-sync">
            <RefreshCw className="h-3 w-3 mr-1" />
            Sync
          </Link>
        </Button>
        <button
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Provider tabs */}
      <div className="flex items-center gap-0 border-b overflow-x-auto shrink-0 bg-background">
        {providers.map((p) => {
          const hasCache = p.provider_models_cache != null;
          const isActive = p.id === activeProviderId;
          return (
            <button
              key={p.id}
              onClick={() => setActiveProviderId(p.id)}
              className={`px-3 py-1.5 text-xs shrink-0 border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.name ?? p.id}
              {hasCache && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3">
          {activeProvider && <ProviderTab provider={activeProvider} />}
        </div>
      </ScrollArea>
    </div>
  );

  if (typeof window === "undefined") return null;
  return ReactDOM.createPortal(modal, document.body);
}
