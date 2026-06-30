"use client";

import { useState } from "react";
import {
  Webhook,
  Check,
  ChevronDown,
  ListTree,
  Ban,
  AlertTriangle,
  Layers,
} from "lucide-react";
import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type {
  ProviderSyncComparison,
  ProviderSyncSummaryInput,
} from "@/features/ai-models/utils/providerSyncComparison";
import {
  buildProviderSyncPagePayload,
  buildProviderSyncProviderPayload,
  buildProviderSyncRowPayload,
  type ProviderSyncPageExport,
  type ProviderSyncStatusFilter,
} from "@/features/ai-models/utils/serializeProviderSyncForAi";

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

const PROVIDER_EXPORT_OPTIONS: {
  filter: ProviderSyncStatusFilter;
  label: string;
  description: string;
  icon: typeof ListTree;
}[] = [
  {
    filter: "all",
    label: "All models",
    description: "Every row for this provider",
    icon: ListTree,
  },
  {
    filter: "matched",
    label: "Matched",
    description: "Provider models already in our DB",
    icon: Check,
  },
  {
    filter: "missing_local",
    label: "Not in DB",
    description: "Provider models missing from our registry",
    icon: AlertTriangle,
  },
  {
    filter: "extra_local",
    label: "Extra / deprecated",
    description: "DB models not returned by the provider API",
    icon: Layers,
  },
  {
    filter: "excluded",
    label: "Excluded",
    description: "Intentionally ignored provider models",
    icon: Ban,
  },
];

export function ProviderSyncRowCopyForAiButton({
  comparison,
  providerName,
}: {
  comparison: ProviderSyncComparison;
  providerName: string | null;
}) {
  return (
    <CopyForAiButton
      label={comparison.display_name}
      size="icon"
      compact
      agent={() => buildProviderSyncRowPayload(comparison, providerName)}
    />
  );
}

export function ProviderSyncProviderCopyForAiMenu({
  summary,
  comparisons,
  disabled = false,
}: {
  summary: ProviderSyncSummaryInput;
  comparisons: ProviderSyncComparison[];
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (filter: ProviderSyncStatusFilter) => {
    const payload = buildProviderSyncProviderPayload(
      summary,
      comparisons,
      filter,
    );
    const text = buildAgentPayload(payload);
    try {
      await writeClipboard(text);
      setCopied(true);
      const option = PROVIDER_EXPORT_OPTIONS.find((o) => o.filter === filter);
      toast.success(
        `${summary.name ?? "Provider"} — ${option?.label ?? "Export"} copied for AI`,
      );
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          disabled={disabled || comparisons.length === 0}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Webhook className="h-3.5 w-3.5" />
          )}
          Copy for AI
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {PROVIDER_EXPORT_OPTIONS.map(
          ({ filter, label, description, icon: Icon }) => (
            <DropdownMenuItem
              key={filter}
              onClick={() => void handleCopy(filter)}
            >
              <Icon className="mr-2 h-4 w-4 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span>{label}</span>
                <span className="text-[10px] text-muted-foreground leading-snug">
                  {description}
                </span>
              </div>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProviderSyncPageCopyForAiButton({
  exports,
  disabled = false,
}: {
  exports: ProviderSyncPageExport[];
  disabled?: boolean;
}) {
  const synced = exports.filter((e) => e.comparisons.length > 0);

  return (
    <CopyForAiButton
      label="Provider sync dashboard"
      size="sm"
      disabled={disabled || synced.length === 0}
      agent={() => buildProviderSyncPagePayload(synced)}
      showLabel
    />
  );
}
