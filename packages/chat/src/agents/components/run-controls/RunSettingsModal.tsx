"use client";

import { Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { RunSettingsEditor } from "./RunSettingsEditor";
import { Button } from "@ai-matrx/design-system/controls";

interface RunSettingsModalProps {
  conversationId: string;
}

export function RunSettingsModal({ conversationId }: RunSettingsModalProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<Settings2 />} title="Test run settings" aria-label="Test run settings" className="shrink-0" />
      </PopoverTrigger>

      <PopoverContent sizing="content" align="end" className="p-3">
        <p className="text-xs font-medium text-muted-foreground mb-3">
          Test Run Settings
        </p>
        <RunSettingsEditor conversationId={conversationId} />
      </PopoverContent>
    </Popover>
  );
}
