"use client";

/**
 * MetadataPanel
 *
 * Displays the agent-authored ImageMetadata for a single source file —
 * editable. Used inside `StudioFileCard` and surfaces below the variant
 * grid. Always renders if metadata is present or in flight; collapses to
 * a "describe" CTA otherwise.
 */

import React, { useState } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  Palette,
  Zap,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageMetadata, StudioSourceFile } from "../types";

interface MetadataPanelProps {
  file: StudioSourceFile;
  isDescribing: boolean;
  onDescribe: () => void;
  onClear: () => void;
  onPatch: (patch: Partial<ImageMetadata>) => void;
}

export function MetadataPanel({
  file,
  isDescribing,
  onDescribe,
  onClear,
  onPatch,
}: MetadataPanelProps) {
  const status = file.metadataStatus;
  const meta = file.imageMetadata;

  // Empty state — no describe yet.
  if (!meta && (status === "idle" || status === "error")) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/10 p-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-primary" /> AI-authored metadata
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Generate filename, alt text, caption, SEO keywords, and dominant
            colours — all in one click.
          </p>
          {status === "error" && file.metadataError && (
            <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {file.metadataError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDescribe}
          disabled={isDescribing}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isDescribing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Zap className="h-3 w-3" />
          )}
          {status === "error" ? "Try again" : "Describe with AI"}
        </button>
      </div>
    );
  }

  // In-flight state.
  if (
    status === "uploading-source" ||
    status === "describing" ||
    isDescribing
  ) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="font-medium">
            {status === "uploading-source"
              ? "Preparing image…"
              : "Asking the AI…"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
          The agent is reading your image to suggest a filename, alt text,
          caption, and SEO copy.
        </p>
      </div>
    );
  }

  // Ready state — render editable fields.
  if (!meta) return null;
  return (
    <MetadataReady
      meta={meta}
      onPatch={onPatch}
      onClear={onClear}
      onRedescribe={onDescribe}
      isDescribing={isDescribing}
    />
  );
}

// ─── Editable display ────────────────────────────────────────────────────────

function MetadataReady({
  meta,
  onPatch,
  onClear,
  onRedescribe,
  isDescribing,
}: {
  meta: ImageMetadata;
  onPatch: (patch: Partial<ImageMetadata>) => void;
  onClear: () => void;
  onRedescribe: () => void;
  isDescribing: boolean;
}) {
  return (
    <div className="rounded-lg border border-success/40 bg-success/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold flex items-center gap-1.5 text-success">
          <Check className="h-3 w-3" />
          AI metadata ready
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRedescribe}
            disabled={isDescribing}
            className="text-[11px] text-muted-foreground hover:text-foreground underline disabled:opacity-40"
            title="Re-run the describe agent"
          >
            {isDescribing ? "Working…" : "Regenerate"}
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-muted-foreground hover:text-destructive underline"
            title="Clear metadata for this file"
          >
            Clear
          </button>
        </div>
      </div>

      <Field
        label="Filename base"
        hint="Used as the slug stem in every generated variant."
        value={meta.filename_base}
        onChange={(v) => onPatch({ filename_base: v })}
        mono
      />
      <Field
        label="Alt text"
        hint="Accessibility description — what a screen reader will read."
        value={meta.alt_text}
        onChange={(v) => onPatch({ alt_text: v })}
        multiline
      />
      <Field
        label="Caption"
        hint="Short caption suitable for social posts."
        value={meta.caption}
        onChange={(v) => onPatch({ caption: v })}
        multiline
      />
      <Field
        label="Title"
        hint="Page / OG title."
        value={meta.title}
        onChange={(v) => onPatch({ title: v })}
      />
      <Field
        label="Description"
        hint="Meta description (≈155 chars)."
        value={meta.description}
        onChange={(v) => onPatch({ description: v })}
        multiline
      />

      <KeywordsEditor
        keywords={meta.keywords}
        onChange={(v) => onPatch({ keywords: v })}
      />

      <ColorSwatches
        colors={meta.dominant_colors}
        onChange={(v) => onPatch({ dominant_colors: v })}
      />
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  multiline,
  mono,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={cn(
            "w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 leading-snug focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none",
            mono && "font-mono",
          )}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full h-7 text-xs rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-primary/20",
            mono && "font-mono",
          )}
        />
      )}
      {hint && (
        <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>
      )}
    </div>
  );
}

// ─── Keywords (chip editor) ─────────────────────────────────────────────────

function KeywordsEditor({
  keywords,
  onChange,
}: {
  keywords: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    if (keywords.includes(s)) return;
    onChange([...keywords, s]);
  };
  const remove = (k: string) => onChange(keywords.filter((x) => x !== k));

  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        Keywords
      </label>
      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background px-1.5 py-1.5 min-h-[28px]">
        {keywords.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
          >
            {k}
            <button
              type="button"
              onClick={() => remove(k)}
              className="text-muted-foreground hover:text-destructive"
              title={`Remove "${k}"`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
              setDraft("");
            } else if (
              e.key === "Backspace" &&
              draft === "" &&
              keywords.length > 0
            ) {
              onChange(keywords.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              add(draft);
              setDraft("");
            }
          }}
          placeholder={keywords.length === 0 ? "Type and press Enter" : ""}
          className="flex-1 min-w-[120px] bg-transparent text-[11px] focus:outline-none"
        />
      </div>
    </div>
  );
}

// ─── Dominant colours ────────────────────────────────────────────────────────

function ColorSwatches({
  colors,
  onChange,
}: {
  colors: string[];
  onChange: (v: string[]) => void;
}) {
  if (colors.length === 0) return null;
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
        <Palette className="h-3 w-3" />
        Dominant colours
      </label>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c, i) => (
          <button
            type="button"
            key={`${c}-${i}`}
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(c).catch(() => {
                  /* noop */
                });
              }
            }}
            title={`Click to copy ${c}`}
            className="group relative flex items-center gap-1.5 rounded-full border border-border bg-background px-1 pr-2 py-0.5 text-[10px] font-mono hover:border-primary/40 transition-colors"
          >
            <span
              className="h-4 w-4 rounded-full border border-black/10 dark:border-white/10 shrink-0"
              style={{ backgroundColor: c }}
            />
            {c.toUpperCase()}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(colors.filter((_, j) => j !== i));
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-muted-foreground hover:text-destructive"
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
