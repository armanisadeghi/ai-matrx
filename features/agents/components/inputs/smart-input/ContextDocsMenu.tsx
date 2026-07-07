"use client";

/**
 * ContextDocsMenu — a compact toolbar popover for quickly toggling and linking
 * the per-conversation documents (Working Document + My Scratchpad) and picking
 * active context, without digging through the `+` run-controls menu.
 *
 * Desktop: Popover. Mobile: BottomSheet (single scroll area, no nested tabs).
 */

import { useState } from "react";
import {
  FileText,
  Layers,
  Link2,
  Lock,
  NotebookPen,
  PanelRight,
} from "lucide-react";
import { useOpenWorkingDocumentPanel } from "@/features/overlays/openers/workingDocumentPanel";
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
import { ActiveContextTree } from "@/features/scopes/components/active-context/ActiveContextTree";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import {
  selectActiveScratchpadId,
  selectWorkingDocContent,
  selectWorkingDocEnabled,
  selectWorkingDocTitle,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  setConversationDocumentEnabledThunk,
  linkConversationDocumentThunk,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import {
  scratchScopeId,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
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
  /** Close the menu after opening the doc, so the sidebar isn't behind it. */
  onOpen?: () => void;
}

function DocRow({
  conversationId,
  kind,
  icon: Icon,
  title,
  description,
  onOpen,
}: DocRowProps) {
  const dispatch = useAppDispatch();
  const openPanel = useOpenWorkingDocumentPanel();
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
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Immediate "see it" affordance — opens the doc in the non-blocking
                right sidebar so the user never has to hunt for a window. */}
            <button
              type="button"
              onClick={() => {
                openPanel({ conversationId, initialKind: kind });
                onOpen?.();
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              <PanelRight className="h-3 w-3" />
              Open
            </button>
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
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Link2 className="h-3 w-3" />
                  Link existing…
                </button>
              }
            />
          </div>
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

/**
 * ScratchRow — the user's GLOBAL scratchpad, gated PER CONVERSATION. The switch
 * is the opt-in: OFF (default) means this chat's agent never sees it; ON sends
 * the active scratchpad (when it has content). Toggling never touches the
 * scratchpad's content or which one is active.
 */
function ScratchRow({
  conversationId,
  onOpen,
}: {
  conversationId: string;
  onOpen?: () => void;
}) {
  const dispatch = useAppDispatch();
  const openPanel = useOpenWorkingDocumentPanel();
  const activeId = useAppSelector(selectActiveScratchpadId);
  const scope = activeId ? scratchScopeId(activeId) : "sp:none";
  const title = useAppSelector(selectWorkingDocTitle(scope, "scratch"));
  const content = useAppSelector(selectWorkingDocContent(scope, "scratch"));
  const enabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );
  const hasContent = content.trim() !== "";

  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* FEATURE exposure, not a document: the title is always the fixed
              feature name. Which scratchpad(s) are shared is chosen per-doc
              in the canvas/workspace. */}
          <span className="text-sm font-medium text-foreground">
            Scratchpad
          </span>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
            <Lock className="h-2.5 w-2.5" />
            Read-only to agent
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">
          {enabled
            ? hasContent
              ? `Sharing "${title?.trim() || "Untitled"}" — pick which ones in the canvas.`
              : "On — your scratchpad is empty, so nothing is sent yet."
            : "Off for this chat — the agent never sees your scratchpads here."}
        </p>
        {enabled && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                openPanel({ conversationId, initialKind: "scratch" });
                onOpen?.();
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              <PanelRight className="h-3 w-3" />
              Open
            </button>
          </div>
        )}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(value) =>
          void dispatch(
            setScratchpadGateThunk({ conversationId, enabled: value }),
          )
        }
        aria-label="Toggle scratchpad for this chat"
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

function ContextDocsMenuBody({
  conversationId,
  onClose,
}: ContextDocsMenuProps & { onClose?: () => void }) {
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
        onOpen={onClose}
      />
      <ScratchRow conversationId={conversationId} onOpen={onClose} />

      <div className="border-t border-border px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Context
      </div>
      <div className="px-2 pb-2">
        <ActiveContextTree />
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
            <ContextDocsMenuBody
              conversationId={conversationId}
              onClose={() => setOpen(false)}
            />
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
