"use client";
// features/voice-agent/components/playground/ToolToggleList.tsx
//
// Per-tool on/off switches. The server-side tools (web_search, x_search) are
// executed by xAI itself — we just declare them in session.update.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { selectVoiceTools } from "../../state/selectors";
import { updateConfig } from "../../state/voiceAgentSlice";
import type { BuiltinToolName, ResolvedRealtimeTool } from "../../types";

interface ToolToggleListProps {
  instanceId: string;
  disabled?: boolean;
}

/** Toggleable xAI builtins. Server/client function tools come from the agent's
 *  resolved set and are not user-toggled in the playground. */
const TOOLS: ReadonlyArray<{
  id: BuiltinToolName;
  label: string;
  description: string;
}> = [
  {
    id: "web_search",
    label: "Web search",
    description:
      "Lets the agent look up information from the open web in real time.",
  },
  {
    id: "x_search",
    label: "X search",
    description:
      "Lets the agent search posts on X (Twitter) for fresh signal.",
  },
];

function builtinTool(id: BuiltinToolName, label: string): ResolvedRealtimeTool {
  return { name: id, description: label, parameters: {}, execution: "builtin" };
}

export function ToolToggleList({ instanceId, disabled }: ToolToggleListProps) {
  const dispatch = useAppDispatch();
  const enabledTools = useAppSelector((s) => selectVoiceTools(s, instanceId));
  const enabledNames = new Set(enabledTools.map((t) => t.name));

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Tools</Label>
      <div className="space-y-3">
        {TOOLS.map((tool) => {
          const isOn = enabledNames.has(tool.id);
          return (
            <div
              key={tool.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
            >
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-foreground">
                  {tool.label}
                </div>
                <div className="text-xs text-muted-foreground leading-snug">
                  {tool.description}
                </div>
              </div>
              <Switch
                checked={isOn}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  // Preserve any non-builtin (server/client) tools already on the
                  // instance; only add/remove this builtin.
                  const others = enabledTools.filter(
                    (t) => t.name !== tool.id,
                  );
                  const next = checked
                    ? [...others, builtinTool(tool.id, tool.label)]
                    : others;
                  dispatch(updateConfig({ instanceId, tools: next }));
                }}
                aria-label={tool.label}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
