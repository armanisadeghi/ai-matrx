"use client";

import { useState } from "react";
import { Check, Copy, Database, FileText, Layers3 } from "lucide-react";
import { toast } from "@/lib/toast";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  allRagAiCopyOptions,
  buildRagAiPayload,
  combineSelectedHumanText,
  defaultRagAiCopyOptions,
  identifiersOnlyRagAiCopyOptions,
  RAG_AI_SECTION_KEYS,
  type RagAiCopyBundle,
  type RagAiCopyOptions,
  type RagAiSectionKey,
} from "@/features/rag/components/search/ragAiCopy";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { cn } from "@/lib/utils";

const OVERLAY_ID = "ragAiCopyWindow" as const;

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

function initialOptions(
  bundle: RagAiCopyBundle,
  initialSections: RagAiSectionKey[] | null,
): RagAiCopyOptions {
  const defaults = defaultRagAiCopyOptions(bundle);
  if (!initialSections?.length) return defaults;
  return {
    ...defaults,
    includedSections: initialSections.filter((key) => bundle.sections[key]),
  };
}

function OptionRow({
  label,
  hint,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-border bg-card px-2.5 py-2",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">
          {label}
        </span>
        <span className="block text-[10px] leading-snug text-muted-foreground">
          {hint}
        </span>
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}

function RagAiCopyWindowInner({
  bundle,
  initialSections,
  onClose,
}: {
  bundle: RagAiCopyBundle;
  initialSections: RagAiSectionKey[] | null;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<RagAiCopyOptions>(() =>
    initialOptions(bundle, initialSections),
  );
  const [copied, setCopied] = useState<"text" | "ai" | null>(null);
  const payload = buildRagAiPayload(bundle, options);
  const preview = buildAgentPayload(payload);
  const byteCount = new Blob([preview]).size;
  const tokenEstimate = Math.ceil(preview.length / 4);
  const availableSections = RAG_AI_SECTION_KEYS.filter(
    (key) => bundle.sections[key],
  );

  const update = (patch: Partial<RagAiCopyOptions>) =>
    setOptions((current) => ({ ...current, ...patch }));
  const toggleSection = (key: RagAiSectionKey, checked: boolean) =>
    update({
      includedSections: checked
        ? [...new Set([...options.includedSections, key])]
        : options.includedSections.filter((candidate) => candidate !== key),
    });
  const flash = (kind: "text" | "ai") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1_500);
  };

  return (
    <WindowPanel
      id="rag-ai-copy-window"
      overlayId={OVERLAY_ID}
      onClose={onClose}
      title="Copy RAG result for AI"
      width={980}
      height={700}
      minWidth={600}
      minHeight={480}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-3 py-2">
          <span className="mr-1 min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {bundle.source.name}
            {bundle.retrieval.pageNumber != null
              ? ` · page ${bundle.retrieval.pageNumber}`
              : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setOptions(identifiersOnlyRagAiCopyOptions())}
          >
            <Database className="h-3.5 w-3.5" />
            Identifiers only
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setOptions(defaultRagAiCopyOptions(bundle))}
          >
            <FileText className="h-3.5 w-3.5" />
            Essentials
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setOptions(allRagAiCopyOptions(bundle))}
          >
            <Layers3 className="h-3.5 w-3.5" />
            Everything available
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[18rem_minmax(0,1fr)] md:divide-x md:divide-border">
          <div className="space-y-2 overflow-y-auto border-b border-border p-3 md:border-b-0">
            <OptionRow
              label="Source + retrieval identifiers"
              hint="Source, file/document, chunk, parent, field, page, and href. Always included."
              checked
              disabled
              onCheckedChange={() => undefined}
            />
            {availableSections.map((key) => {
              const section = bundle.sections[key];
              if (!section) return null;
              return (
                <OptionRow
                  key={key}
                  label={section.label}
                  hint={section.description}
                  checked={options.includedSections.includes(key)}
                  onCheckedChange={(checked) => toggleSection(key, checked)}
                />
              );
            })}
            <OptionRow
              label="Ranking facts"
              hint="Scores, vector/lexical/rerank positions, and matched entities."
              checked={options.includeRanking}
              onCheckedChange={(checked) => update({ includeRanking: checked })}
            />
            <OptionRow
              label="Raw result metadata"
              hint="Additional non-content metadata after large source fields are removed."
              checked={options.includeMetadata}
              onCheckedChange={(checked) =>
                update({ includeMetadata: checked })
              }
            />

            <div className="rounded-md border border-border bg-card p-2.5">
              <label
                className="text-xs font-medium text-foreground"
                htmlFor="rag-ai-max-chars"
              >
                Max characters per text field
              </label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                0 keeps the full text. Truncation is labeled inside the payload.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {[2_000, 8_000, 20_000, 0].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={
                      options.maxTextChars === value ? "default" : "outline"
                    }
                    className="h-7 px-2 text-[10px]"
                    onClick={() => update({ maxTextChars: value })}
                  >
                    {value === 0 ? "Full" : value.toLocaleString()}
                  </Button>
                ))}
                <Input
                  id="rag-ai-max-chars"
                  type="number"
                  min={0}
                  step={1_000}
                  value={options.maxTextChars}
                  onChange={(event) =>
                    update({
                      maxTextChars: Math.max(
                        0,
                        Number(event.target.value) || 0,
                      ),
                    })
                  }
                  className="h-7 w-24 text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-2.5">
              <label
                className="text-xs font-medium text-foreground"
                htmlFor="rag-ai-max-items"
              >
                Max rows/items per list
              </label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                0 keeps every currently loaded item; totals remain explicit.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {[10, 25, 50, 0].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={options.maxItems === value ? "default" : "outline"}
                    className="h-7 px-2 text-[10px]"
                    onClick={() => update({ maxItems: value })}
                  >
                    {value === 0 ? "All" : value}
                  </Button>
                ))}
                <Input
                  id="rag-ai-max-items"
                  type="number"
                  min={0}
                  step={5}
                  value={options.maxItems}
                  onChange={(event) =>
                    update({
                      maxItems: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                  className="h-7 w-20 text-xs tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col p-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
              <span>{options.includedSections.length} content sections</span>
              <span>{preview.length.toLocaleString()} chars</span>
              <span>{byteCount.toLocaleString()} bytes</span>
              <span>~{tokenEstimate.toLocaleString()} tokens</span>
            </div>
            <pre className="min-h-0 flex-1 select-text overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/20 p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {preview}
            </pre>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-3 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={options.includedSections.length === 0}
            onClick={() => {
              void writeClipboard(
                combineSelectedHumanText(bundle, options),
              ).then(
                () => {
                  flash("text");
                  toast.success("Selected RAG content copied");
                },
                () => toast.error("Could not copy selected RAG content"),
              );
            }}
          >
            {copied === "text" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy selected content
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void writeClipboard(
                buildAgentPayload(buildRagAiPayload(bundle, options)),
              ).then(
                () => {
                  flash("ai");
                  toast.success("RAG result copied for AI");
                },
                () => toast.error("Could not copy RAG result for AI"),
              );
            }}
          >
            {copied === "ai" ? (
              <Check className="h-4 w-4" />
            ) : (
              <CopyForAiIcon className="h-4 w-4" />
            )}
            Copy for AI
          </Button>
        </div>
      </div>
    </WindowPanel>
  );
}

export interface RagAiCopyWindowProps {
  isOpen: boolean;
  onClose: () => void;
  bundle: RagAiCopyBundle | null;
  initialSections?: RagAiSectionKey[] | null;
}

export default function RagAiCopyWindow({
  isOpen,
  onClose,
  bundle,
  initialSections = null,
}: RagAiCopyWindowProps) {
  if (!isOpen || !bundle) return null;
  const key = `${bundle.retrieval.chunkId}|${initialSections?.join(",") ?? "default"}`;
  return (
    <RagAiCopyWindowInner
      key={key}
      bundle={bundle}
      initialSections={initialSections}
      onClose={onClose}
    />
  );
}
