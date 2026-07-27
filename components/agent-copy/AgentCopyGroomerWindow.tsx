"use client";

/**
 * AgentCopyGroomerWindow — the page-level "Copy for AI" groomer.
 *
 * A WindowPanel where the user shapes the whole-page agent payload before
 * copying: variation presets (Everything / Balanced / Minimal), a per-section
 * detail dial (Full / Compact / Brief / Off), live per-section and total size
 * estimates, and a live preview of the exact payload that will be copied.
 *
 * NEVER static-import this from a page — render it via
 * `AgentCopyGroomerLauncher` (dynamic, ssr:false) so the WindowPanel stack
 * stays out of the route chunk.
 */

import { useMemo, useState } from "react";
import { Check, Copy, Scissors } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import {
  applyGroomerPreset,
  defaultGroomerSelections,
  GROOMER_LEVELS,
  type AgentCopyGroomerConfig,
  type GroomerLevel,
  type GroomerPreset,
  type GroomerSelection,
} from "@/components/agent-copy/groomer-types";

const LEVEL_LABEL: Record<GroomerLevel, string> = {
  full: "Full",
  compact: "Compact",
  brief: "Brief",
};

const PRESETS: { id: GroomerPreset; label: string; hint: string }[] = [
  { id: "everything", label: "Everything", hint: "All sections, full detail" },
  { id: "balanced", label: "Balanced", hint: "Compact detail everywhere" },
  {
    id: "minimal",
    label: "Minimal",
    hint: "Brief summaries; cuttable sections dropped",
  },
];

function formatSize(chars: number): string {
  const tokens = Math.round(chars / 4);
  const charLabel =
    chars >= 1000 ? `${(chars / 1000).toFixed(1)}k` : String(chars);
  const tokenLabel =
    tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
  return `${charLabel} chars · ~${tokenLabel} tokens`;
}

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

export interface AgentCopyGroomerWindowProps {
  config: AgentCopyGroomerConfig;
  onClose: () => void;
  windowId?: string;
}

export function AgentCopyGroomerWindow({
  config,
  onClose,
  windowId = "agent-copy-groomer",
}: AgentCopyGroomerWindowProps) {
  const [selections, setSelections] = useState<
    Record<string, GroomerSelection>
  >(() => defaultGroomerSelections(config.sections));
  const [copied, setCopied] = useState(false);

  const activePreset = useMemo<GroomerPreset | null>(() => {
    for (const preset of PRESETS) {
      const target = applyGroomerPreset(preset.id, config.sections);
      if (
        config.sections.every(
          (section) => selections[section.id] === target[section.id],
        )
      ) {
        return preset.id;
      }
    }
    return null;
  }, [selections, config.sections]);

  // Per-section built data + size at the current selection.
  const built = useMemo(() => {
    const out: Record<string, { data: unknown; chars: number }> = {};
    for (const section of config.sections) {
      const selection = selections[section.id] ?? "full";
      if (selection === "off") {
        out[section.id] = { data: undefined, chars: 0 };
        continue;
      }
      const data = section.build(selection);
      const chars =
        data === null || data === undefined
          ? 0
          : JSON.stringify(data, null, 2).length;
      out[section.id] = { data, chars };
    }
    return out;
  }, [selections, config.sections]);

  const payload = useMemo(() => {
    const data: Record<string, unknown> = {};
    const includedIds: string[] = [];
    for (const section of config.sections) {
      const entry = built[section.id];
      if (entry && entry.data !== null && entry.data !== undefined) {
        data[section.id] = entry.data;
        includedIds.push(section.id);
      }
    }
    return buildAgentPayload({
      kind: config.kind,
      location: config.location,
      description: config.description,
      data,
      summary: config.summary,
      attributes: {
        ...config.attributes,
        sections: includedIds.join(","),
      },
      context: config.context,
    });
  }, [built, config]);

  const includedCount = config.sections.filter((section) => {
    const entry = built[section.id];
    return entry && entry.data !== null && entry.data !== undefined;
  }).length;

  const handleCopy = async () => {
    await writeClipboard(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success(`${config.label} copied for AI agent`);
  };

  return (
    <WindowPanel
      id={windowId}
      title={`Copy for AI — ${config.label}`}
      onClose={onClose}
      width={980}
      height={620}
      minWidth={520}
      minHeight={360}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      secondaryPanel={
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Live preview — exactly what will be copied
            </span>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {payload}
          </pre>
        </div>
      }
      secondaryPanelDefaultSize={420}
      secondaryPanelMinSize={280}
      footerLeft={
        <span className="tabular-nums text-muted-foreground">
          {includedCount}/{config.sections.length} sections ·{" "}
          {formatSize(payload.length)}
        </span>
      }
      footerRight={
        <Button size="sm" className="gap-1.5" onClick={() => void handleCopy()}>
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <CopyForAiIcon className="h-3.5 w-3.5" />
          )}
          Copy for AI
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          <span className="mr-1 text-xs font-medium text-muted-foreground">
            Variation
          </span>
          {PRESETS.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant={activePreset === preset.id ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-xs"
              title={preset.hint}
              onClick={() =>
                setSelections(applyGroomerPreset(preset.id, config.sections))
              }
            >
              {preset.label}
            </Button>
          ))}
          {activePreset === null ? (
            <span className="text-xs text-muted-foreground">(custom)</span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {config.sections.map((section) => {
            const selection = selections[section.id] ?? "full";
            const entry = built[section.id];
            return (
              <div
                key={section.id}
                className={cn(
                  "rounded-md border border-border/60 bg-muted/20 px-3 py-2",
                  selection === "off" && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {section.title}
                      {section.cuttable ? (
                        <Scissors
                          className="h-3 w-3 text-muted-foreground"
                          aria-label="Safe to cut"
                        />
                      ) : null}
                    </p>
                    {section.description ? (
                      <p className="text-xs text-muted-foreground">
                        {section.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {selection === "off" ? "cut" : formatSize(entry.chars)}
                    </span>
                    <div className="flex overflow-hidden rounded-md border border-border">
                      {GROOMER_LEVELS.map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={cn(
                            "px-2 py-1 text-xs transition-colors",
                            selection === level
                              ? "bg-accent font-medium text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          )}
                          title={section.levelLabels?.[level]}
                          onClick={() =>
                            setSelections((current) => ({
                              ...current,
                              [section.id]: level,
                            }))
                          }
                        >
                          {section.levelLabels?.[level] ?? LEVEL_LABEL[level]}
                        </button>
                      ))}
                      {section.cuttable ? (
                        <button
                          type="button"
                          className={cn(
                            "border-l border-border px-2 py-1 text-xs transition-colors",
                            selection === "off"
                              ? "bg-destructive/10 font-medium text-destructive"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          )}
                          title="Cut this section entirely"
                          onClick={() =>
                            setSelections((current) => ({
                              ...current,
                              [section.id]: "off",
                            }))
                          }
                        >
                          Off
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </WindowPanel>
  );
}

export default AgentCopyGroomerWindow;
