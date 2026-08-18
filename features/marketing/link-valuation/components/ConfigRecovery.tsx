"use client";

/**
 * What the user sees when a saved config cannot be run.
 *
 * The rule this obeys is the house one: build the protective layer, and make it
 * SCREAM when it fires. A recovery that happens quietly teaches everyone the
 * system is fine while it silently scores links with a config nobody chose.
 */

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  configName: string;
  reason: string;
  onRecover: () => void;
}

export function ConfigRecovery({ configName, reason, onRecover }: Props) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-lg rounded-md border border-destructive/40 bg-destructive/10 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-destructive">
              The saved config &ldquo;{configName}&rdquo; could not be run
            </p>
            <p className="text-xs text-foreground">
              Nothing was scored with it. This is a defect worth reporting — a
              config that reaches the engine should already have been rejected
              when it was imported.
            </p>
            <p className="rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
              {reason}
            </p>
            <Button size="sm" className="w-fit text-xs" onClick={onRecover}>
              Discard it and return to the shipped config
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
