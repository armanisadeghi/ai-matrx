"use client";

import { useState, useRef, useCallback } from "react";
import { Wrench, ClipboardList, FileText, AlignLeft } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgentToolsManager } from "@/features/agents/components/tools-management/AgentToolsManager";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentTools,
  selectAgentDirtyFields,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectAllTools } from "@/features/agents/redux/tools/tools.selectors";
import { resetAgentField } from "@/features/agents/redux/agent-definition/slice";
import { fetchAvailableTools } from "@/features/agents/redux/tools/tools.thunks";
import { hasField } from "@/features/agents/redux/shared/field-flags";

interface AgentToolsModalProps {
  agentId: string;
}

export function AgentToolsModal({ agentId }: AgentToolsModalProps) {
  const [open, setOpen] = useState(false);
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();

  const selectedTools = useAppSelector((state) =>
    selectAgentTools(state, agentId),
  );
  const allTools = useAppSelector(selectAllTools);
  const dirtyFields = useAppSelector((state) =>
    selectAgentDirtyFields(state, agentId),
  );
  const enabledCount = Array.isArray(selectedTools) ? selectedTools.length : 0;

  const handleCopy = useCallback(
    (mode: "basic" | "detailed") => {
      if (!Array.isArray(selectedTools) || selectedTools.length === 0) {
        toast.info("No tools selected");
        return;
      }

      const toolMap = new Map(allTools.map((t) => [t.id, t]));
      const lines = selectedTools.map((id) => {
        const tool = toolMap.get(id);
        if (!tool) return `${id} — (unknown tool)`;
        if (mode === "basic") {
          return `${tool.id} | ${tool.name}`;
        }
        const parts = [`${tool.id} | ${tool.name}`];
        if (tool.description) parts.push(`  Description: ${tool.description}`);
        if (tool.category) parts.push(`  Category: ${tool.category}`);
        if (tool.source_kind) parts.push(`  Source: ${tool.source_kind}`);
        if (tool.semver) parts.push(`  Version: ${tool.semver}`);
        return parts.join("\n");
      });

      const text = mode === "basic" ? lines.join("\n") : lines.join("\n\n");

      navigator.clipboard.writeText(text).then(() => {
        toast.success(
          `Copied ${selectedTools.length} tool${selectedTools.length === 1 ? "" : "s"} (${mode === "basic" ? "basic" : "detailed"})`,
        );
      });
    },
    [selectedTools, allTools],
  );

  const hadToolsDirtyOnOpen = useRef(false);
  const hadCustomToolsDirtyOnOpen = useRef(false);

  const handleOpen = useCallback(() => {
    hadToolsDirtyOnOpen.current = dirtyFields
      ? hasField(dirtyFields, "tools")
      : false;
    hadCustomToolsDirtyOnOpen.current = dirtyFields
      ? hasField(dirtyFields, "customTools")
      : false;
    dispatch(fetchAvailableTools());
    setOpen(true);
  }, [dirtyFields, dispatch]);

  const handleDone = useCallback(() => {
    setOpen(false);
  }, []);

  const handleCancel = useCallback(() => {
    if (
      !hadToolsDirtyOnOpen.current &&
      dirtyFields &&
      hasField(dirtyFields, "tools")
    ) {
      dispatch(resetAgentField({ id: agentId, field: "tools" }));
    }
    if (
      !hadCustomToolsDirtyOnOpen.current &&
      dirtyFields &&
      hasField(dirtyFields, "customTools")
    ) {
      dispatch(resetAgentField({ id: agentId, field: "customTools" }));
    }
    setOpen(false);
  }, [agentId, dirtyFields, dispatch]);

  const toolsChangedInSession =
    (!hadToolsDirtyOnOpen.current &&
      !!dirtyFields &&
      hasField(dirtyFields, "tools")) ||
    (!hadCustomToolsDirtyOnOpen.current &&
      !!dirtyFields &&
      hasField(dirtyFields, "customTools"));

  const footer = (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0 bg-background">
      {toolsChangedInSession && (
        <span className="text-[11px] text-muted-foreground mr-auto">
          Unsaved changes
        </span>
      )}
      {enabledCount > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              title="Copy tool list to clipboard"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Copy list
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Copy {enabledCount} selected tool{enabledCount === 1 ? "" : "s"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs gap-2 cursor-pointer"
              onClick={() => handleCopy("basic")}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="font-medium">Basic</div>
                <div className="text-muted-foreground">ID and name only</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs gap-2 cursor-pointer"
              onClick={() => handleCopy("detailed")}
            >
              <AlignLeft className="h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="font-medium">Detailed</div>
                <div className="text-muted-foreground">
                  Includes description, category &amp; more
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={handleCancel}
      >
        Cancel
      </Button>
      <Button size="sm" className="h-8 text-xs" onClick={handleDone}>
        Done
      </Button>
    </div>
  );

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 relative"
      onClick={handleOpen}
      title="Tools"
    >
      <Wrench className="h-4 w-4" />
      {enabledCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground leading-none">
          {enabledCount > 9 ? "9+" : enabledCount}
        </span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer
          open={open}
          onOpenChange={(v) => {
            if (!v) handleCancel();
            else setOpen(v);
          }}
        >
          <DrawerContent className="max-h-[90dvh] flex flex-col">
            <DrawerHeader className="px-4 pt-4 pb-2 shrink-0">
              <DrawerTitle>Agent Tools</DrawerTitle>
              <DrawerDescription>
                Tap to enable tools for this agent
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4">
              <AgentToolsManager agentId={agentId} />
            </div>
            {footer}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) handleCancel();
          else setOpen(v);
        }}
      >
        <DialogContent className="max-w-[90vw] w-full xl:max-w-6xl h-[88dvh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-5 pb-4 shrink-0 border-b border-border">
            <DialogTitle className="text-base font-semibold">
              Agent Tools
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select what this agent can use
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            <AgentToolsManager agentId={agentId} />
          </div>
          {footer}
        </DialogContent>
      </Dialog>
    </>
  );
}
