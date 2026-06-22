"use client";

/**
 * ContextDocsMenu — a compact toolbar popover for quickly toggling and linking
 * the per-conversation documents (Working Document + My Scratchpad) and picking
 * active context, without digging through the `+` run-controls menu.
 *
 * Desktop: Popover. Mobile: BottomSheet (single scroll area, no nested tabs).
 */

import { useState } from "react";
import { FileText, Layers, Link2, Lock, NotebookPen } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@/components/official/bottom-sheet/BottomSheet";
import { INPUT_BUTTON_IDLE_TINT } from "./InputActionButtons";
import { ActiveContextPanel } from "@/features/scopes/components/active-context/ActiveContextPanel";
import { ActiveContextLayersPanel } from "@/features/scopes/components/active-context/ActiveContextLayersPanel";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import { selectWorkingDocEnabled } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  setConversationDocumentEnabledThunk,
  linkConversationDocumentThunk,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import type { WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { DocumentLinkPicker } from "@/features/agents/components/working-document/DocumentLinkPicker";

interface ContextDocsMenuProps {
  conversationId: string;
}

interface DocRowProps {
  conversationId: string;
  kind: WorkingDocumentKind;
  icon: typeof FileText;
  title: string;
  description: string;
}

function DocRow({
  conversationId,
  kind,
  icon: Icon,
  title,
  description,
}: DocRowProps) {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(selectWorkingDocEnabled(conversationId, kind));

  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {kind === "scratch" && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              <Lock className="h-2.5 w-2.5" />
              Read-only to agent
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {description}
        </p>
        {enabled && (
          <DocumentLinkPicker
            kind={kind}
            align="start"
            side="bottom"
            onSelect={(documentId) =>
              void dispatch(
                linkConversationDocumentThunk({
                  conversationId,
                  kind,
                  documentId,
                }),
              )
            }
            trigger={
              <button
                type="button"
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Link2 className="h-3 w-3" />
                Link existing…
              </button>
            }
          />
        )}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(value) =>
          void dispatch(
            setConversationDocumentEnabledThunk({
              conversationId,
              kind,
              enabled: value,
            }),
          )
        }
        aria-label={`Toggle ${title}`}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

function ContextDocsMenuBody({ conversationId }: ContextDocsMenuProps) {
  return (
    <>
      <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Documents
      </div>
      <DocRow
        conversationId={conversationId}
        kind="working"
        icon={FileText}
        title="Working document"
        description="A shared, living document you build with the agent. It can read and edit it each round."
      />
      <DocRow
        conversationId={conversationId}
        kind="scratch"
        icon={NotebookPen}
        title="My scratchpad"
        description="A private space the agent can read for context — but never edits."
      />

      <div className="border-t border-border px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Context
      </div>
      <ActiveContextPanel checkboxVariant="standard" sectionHeight={200} />
      <div className="border-t border-border px-3 py-2">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Selected context
        </div>
        <ActiveContextLayersPanel />
      </div>
    </>
  );
}

export function ContextDocsMenu({ conversationId }: ContextDocsMenuProps) {
  const isMobile = useIsMobile();
  const dialogContainer = useDialogContainer();
  const [open, setOpen] = useState(false);

  const workingEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "working"),
  );
  const scratchEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );
  const hasActiveContext = useAppSelector(selectHasActiveContext);

  const isActive = workingEnabled || scratchEnabled || hasActiveContext;

  const triggerButton = (
    <button
      type="button"
      tabIndex={-1}
      title="Documents & context"
      aria-label="Documents & context"
      onClick={isMobile ? () => setOpen(true) : undefined}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        INPUT_BUTTON_IDLE_TINT,
      )}
    >
      <Layers className="h-4 w-4" />
      {isActive && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
      )}
    </button>
  );

  if (isMobile) {
    return (
      <>
        {triggerButton}
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title="Documents & context"
        >
          <BottomSheetHeader title="Documents & context" />
          <BottomSheetBody>
            <ContextDocsMenuBody conversationId={conversationId} />
          </BottomSheetBody>
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[min(360px,calc(100vw-1rem))] p-0 border-border"
        container={dialogContainer ?? undefined}
      >
        <div className="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain">
          <ContextDocsMenuBody conversationId={conversationId} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
