"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import { Check, Copy, Database, ExternalLink, FileText, Layers3 } from "lucide-react";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
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
import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";

const OVERLAY_ID = "ragAiCopyWindow" as const;

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
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
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
      title="Copy Knowledge result for AI"
      width={980}
      height={700}
      minWidth={600}
      minHeight={480}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {/*
       * Page-local export config for ONE already-selected retrieval result —
       * no list of rows to menu, so the growth this window can offer is a
       * door back to the source document it has no other link to.
       */}
      <NonEditableContextMenu
        sourceFeature="rag-search"
        contentSource={{ type: "raw" }}
        contextData={{ content: preview }}
        extraSections={[
          {
            id: "rag-ai-copy-source",
            label: bundle.source.name,
            items: [
              {
                kind: "link",
                id: "rag-ai-copy-open-source",
                label: "Open source",
                icon: ExternalLink,
                href: bundle.source.href,
              },
            ],
          },
        ]}
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
            icon={<Database />}
            type="button"
            variant="outline"
            onClick={() => setOptions(identifiersOnlyRagAiCopyOptions())}
          >
            Identifiers only
          </Button>
          <Button
            icon={<FileText />}
            type="button"
            variant="outline"
            onClick={() => setOptions(defaultRagAiCopyOptions(bundle))}
          >
            Essentials
          </Button>
          <Button
            icon={<Layers3 />}
            type="button"
            variant="outline"
            onClick={() => setOptions(allRagAiCopyOptions(bundle))}
          >
            Everything available
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[18rem_minmax(0,1fr)] md:divide-x md:divide-border">
          <div className="space-y-2 overflow-y-auto border-b border-border p-3 md:border-b-0">
            <OptionRow
              label="Source + retrieval identifiers"
              hint="Source, document, chunk, parent, field, page, and link."
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
              hint="Scores, ranking positions, and matched entities."
              checked={options.includeRanking}
              onCheckedChange={(checked) => update({ includeRanking: checked })}
            />
            <OptionRow
              label="Raw result metadata"
              hint="Extra metadata with large source fields removed."
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
                {/* Truncation is labeled inside the payload. */}
                0 keeps the full text
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {[2_000, 8_000, 20_000, 0].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={
                      options.maxTextChars === value ? "primary" : "outline"
                    }
                    onClick={() => update({ maxTextChars: value })}
                  >
                    {value === 0 ? "Full" : value.toLocaleString()}
                  </Button>
                ))}
                <ClampedNumberInput
                  id="rag-ai-max-chars"
                  min={0}
                  step={1_000}
                  value={options.maxTextChars}
                  onChange={(n) => update({ maxTextChars: n })}
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
                    variant={options.maxItems === value ? "primary" : "outline"}
                    onClick={() => update({ maxItems: value })}
                  >
                    {value === 0 ? "All" : value}
                  </Button>
                ))}
                <ClampedNumberInput
                  id="rag-ai-max-items"
                  min={0}
                  step={5}
                  value={options.maxItems}
                  onChange={(n) => update({ maxItems: n })}
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
            icon={copied === "text" ? (
              <Check />
            ) : (
              <Copy />
            )}
            type="button"
            variant="outline"
            disabled={options.includedSections.length === 0}
            onClick={() => {
              void copyText(
                combineSelectedHumanText(bundle, options),
                "Selected Knowledge content copied",
                "Could not copy selected Knowledge content",
              ).then((copiedOk) => {
                if (!copiedOk) return;
                flash("text");
              });
            }}
          >
            Copy selected content
          </Button>
          <Button
            icon={copied === "ai" ? (
              <Check />
            ) : (
              <CopyForAiIcon />
            )}
            variant="primary"
            type="button"
            onClick={() => {
              void copyText(
                buildAgentPayload(buildRagAiPayload(bundle, options)),
                "Knowledge result copied for AI",
                "Could not copy Knowledge result for AI",
              ).then((copiedOk) => {
                if (!copiedOk) return;
                flash("ai");
              });
            }}
          >
            Copy for AI
          </Button>
        </div>
      </div>
      </NonEditableContextMenu>
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
