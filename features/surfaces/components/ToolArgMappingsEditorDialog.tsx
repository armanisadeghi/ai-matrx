"use client";

/**
 * DEPRECATED — no callers post-2026 refactor.
 *
 * This dialog used to edit `tl_def_surface.arg_mappings` — the per-(tool,
 * surface) row that mapped surface_value names into tool argument slots. The
 * 2026 tool-system refactor dropped `tl_def_surface` entirely. Surfaces now
 * declare tools via `tool_surface_defaults.always_include_tools` (text[] of
 * tool names) and literal jsonb defaults via `tool_surface_defaults.arg_defaults`
 * — no surface_value indirection on the tool path.
 *
 * The file is kept as a compile-only stub so we don't break any lingering
 * import. The exported component renders a "no longer available" notice and
 * does not perform any DB I/O.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  toolId: string;
  surfaceName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ToolArgMappingsEditorDialog({
  toolId,
  surfaceName,
  onClose,
}: Props) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Tool arg mappings no longer editable here
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            The per-(tool, surface) <code className="font-mono">tl_def_surface</code>{" "}
            table was dropped in the 2026 tool-system refactor.
          </p>
          <p>
            Surfaces now declare tools via{" "}
            <code className="font-mono">tool_surface_defaults.always_include_tools</code>
            , and per-tool argument defaults live as literal jsonb in{" "}
            <code className="font-mono">tool_surface_defaults.arg_defaults</code>.
            Edit the underlying surface defaults to change inclusions.
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/70">
            tool: {toolId} · surface: {surfaceName}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
