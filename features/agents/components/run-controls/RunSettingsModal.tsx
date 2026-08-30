"use client";

import { Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { RunSettingsEditor } from "./RunSettingsEditor";

interface RunSettingsModalProps {
  conversationId: string;
}

export function RunSettingsModal({ conversationId }: RunSettingsModalProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Test run settings"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-xs font-medium text-muted-foreground mb-3">
          Test Run Settings
        </p>
        <RunSettingsEditor conversationId={conversationId} />
      </PopoverContent>
    </Popover>
  );
}
