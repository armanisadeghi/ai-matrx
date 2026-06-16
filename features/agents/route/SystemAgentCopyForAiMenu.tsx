"use client";

import { useState } from "react";
import {
  Webhook,
  Check,
  ChevronDown,
  Braces,
  FileText,
  ListTree,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentDefinition,
  selectAgentMessages,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectModelNameById } from "@/features/ai-models/redux/modelRegistrySlice";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  buildSystemAgentAiPayload,
  type SystemAgentAiExportMode,
} from "@/features/agents/route/buildSystemAgentAiPayload";

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

const EXPORT_OPTIONS: {
  mode: SystemAgentAiExportMode;
  label: string;
  description: string;
  icon: typeof ListTree;
}[] = [
  {
    mode: "basics",
    label: "Basics",
    description: "Identity, IDs, model, variables (no defaults)",
    icon: ListTree,
  },
  {
    mode: "with-messages",
    label: "With messages",
    description: "Basics plus the full messages array",
    icon: FileText,
  },
  {
    mode: "full-json",
    label: "Full JSON",
    description: "Basics, messages, and complete definition JSON",
    icon: Braces,
  },
];

interface SystemAgentCopyForAiMenuProps {
  agentId: string;
  liveAgentId: string;
  currentVersionId: string | null;
  disabled?: boolean;
}

export function SystemAgentCopyForAiMenu({
  agentId,
  liveAgentId,
  currentVersionId,
  disabled = false,
}: SystemAgentCopyForAiMenuProps) {
  const [copied, setCopied] = useState(false);

  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const definition = useAppSelector((state) =>
    selectAgentDefinition(state, agentId),
  );
  const messages = useAppSelector((state) =>
    selectAgentMessages(state, agentId),
  );
  const modelName = useAppSelector((state) =>
    selectModelNameById(state, agent?.modelId ?? null),
  );

  const handleCopy = async (mode: SystemAgentAiExportMode) => {
    if (!agent || !definition) return;

    const text = buildSystemAgentAiPayload({
      agent,
      liveAgentId,
      currentVersionId,
      modelName: modelName ?? null,
      exportMode: mode,
      messages: messages ?? [],
      fullDefinition: definition,
    });

    try {
      await writeClipboard(text);
      setCopied(true);
      const option = EXPORT_OPTIONS.find((o) => o.mode === mode);
      toast.success(`${option?.label ?? "Agent"} copied for AI`);
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
          disabled={disabled || !agent || !definition}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Webhook className="w-3.5 h-3.5" />
          )}
          Copy for AI
          <ChevronDown className="w-3 h-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {EXPORT_OPTIONS.map(({ mode, label, description, icon: Icon }) => (
          <DropdownMenuItem key={mode} onClick={() => void handleCopy(mode)}>
            <Icon className="mr-2 h-4 w-4 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span>{label}</span>
              <span className="text-[10px] text-muted-foreground leading-snug">
                {description}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
