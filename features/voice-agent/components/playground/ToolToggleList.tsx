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
import type { ToolName } from "../../types";

interface ToolToggleListProps {
  instanceId: string;
  disabled?: boolean;
}

const TOOLS: ReadonlyArray<{
  id: ToolName;
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

export function ToolToggleList({ instanceId, disabled }: ToolToggleListProps) {
  const dispatch = useAppDispatch();
  const enabledTools = useAppSelector((s) => selectVoiceTools(s, instanceId));
  const enabled = new Set(enabledTools);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Tools</Label>
      <div className="space-y-3">
        {TOOLS.map((tool) => {
          const isOn = enabled.has(tool.id);
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
                  const next = new Set(enabled);
                  if (checked) next.add(tool.id);
                  else next.delete(tool.id);
                  dispatch(
                    updateConfig({
                      instanceId,
                      tools: Array.from(next) as ToolName[],
                    }),
                  );
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
