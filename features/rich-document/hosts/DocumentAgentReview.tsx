"use client";

// features/rich-document/hosts/DocumentAgentReview.tsx
//
// A text field's AI powers (Clean up, Help with this…, Custom agent) on a
// RENDERED document. Three steps, one dialog:
//
//   1. Prepare — the source's own save adapter hands back the authoritative
//      bytes (a note's physical body, a chat row's single message), so the
//      agent works on what is stored, not on what a view happened to render.
//   2. Run — the SAME machinery ProTextarea uses: Clean up runs the cleanup
//      role's agent through useProTextareaAgentAction; Help / Custom agent run
//      in ProTextareaAgentPanel (mandate door or the person's chosen agent).
//   3. Review — the proposal as a diff against the source. Apply writes
//      through the source's save adapter as a SPLICE (only the changed blocks
//      change — review/proposedEdit.ts); a proposal that would rewrite a
//      protected island (code, math, a kind block…) is refused with the reason,
//      never forced. Discard writes nothing.

import * as React from "react";
import { DiffViewer } from "@ai-matrx/diff/react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProTextAgentActionPopoverBody } from "@/components/official/ProTextAgentActionPopoverBody";
import { ProTextareaAgentPanel } from "@/components/official/ProTextareaAgentPanel";
import { useProTextareaAgentAction } from "@/components/official/useProTextareaAgentAction";
import {
  PRO_TEXTAREA_AGENT_ACTIONS,
  PRO_TEXTAREA_HELP_DEFAULT_MANDATE_KEY,
  type ProTextareaAgentActionId,
} from "@/components/official/proTextareaAgentActions";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { CLEANUP_SURFACE_NAME } from "@/features/transcription-cleanup/hooks/useAiPostProcess";
import { getErrorMessage } from "../actions/utils";
import {
  acknowledgedPreparedSource,
  prepareContentEdit,
  savePreparedContentEdit,
} from "../actions/handlers/preparedEdit";
import { spliceProposal } from "../review/proposedEdit";
import type { ContentSource, RichDocumentActionContext } from "../types";

export interface DocumentAgentReviewProps {
  actionId: ProTextareaAgentActionId;
  ctx: RichDocumentActionContext;
  onClose: () => void;
}

type Prepared = { source: ContentSource; content: string };

export function DocumentAgentReview({
  actionId,
  ctx,
  onClose,
}: DocumentAgentReviewProps): React.ReactElement {
  const definition = PRO_TEXTAREA_AGENT_ACTIONS[actionId];
  const [prepared, setPrepared] = React.useState<Prepared | null>(null);
  const [prepareError, setPrepareError] = React.useState<string | null>(null);
  const [proposal, setProposal] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [agentName, setAgentName] = React.useState<string | null>(null);
  const agentAction = useProTextareaAgentAction();
  const cleanupRoles = useSurfaceAgentRoles(CLEANUP_SURFACE_NAME);
  const cleanupAgentId = cleanupRoles.roles.clean?.effectiveAgentId ?? null;

  React.useEffect(() => {
    let cancelled = false;
    void prepareContentEdit(ctx).then(
      (p) => {
        if (!cancelled) setPrepared(p);
      },
      (error: unknown) => {
        if (!cancelled) {
          setPrepareError(getErrorMessage(error, "This content cannot be saved from here."));
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // Prepare ONCE per open — the bytes the agent works on must not move.
  }, []);

  const effectiveCleanupAgent = agentId ?? cleanupAgentId;

  // The splice is computed up front so a refusal is SAID before Apply, never
  // discovered after it.
  let splice: ReturnType<typeof spliceProposal> = null;
  let spliceError: string | null = null;
  if (prepared && proposal !== null) {
    try {
      splice = spliceProposal(prepared.content, proposal);
    } catch (error) {
      spliceError = getErrorMessage(error, "This change cannot be applied as a splice.");
    }
  }

  const apply = async () => {
    if (!prepared || !splice) return;
    setSaving(true);
    try {
      await savePreparedContentEdit({
        ctx,
        source: prepared.source,
        newContent: splice.text,
        // The proposal was spliced into the text this review opened on (for a
        // chat answer: its display projection) — the adapter maps the change
        // onto the stored bytes.
        previousContent: prepared.content,
      });
      toast.success(definition.applySuccessToast, {
        description: `${splice.changes.length} changed ${splice.changes.length === 1 ? "part" : "parts"} saved; everything else untouched.`,
      });
      onClose();
    } catch (error) {
      const settled = acknowledgedPreparedSource(prepared.source, error, splice.text);
      if (settled) setPrepared({ source: settled, content: splice.text });
      toast.error(getErrorMessage(error, "Could not save the change"));
    } finally {
      setSaving(false);
    }
  };

  let body: React.ReactNode;
  if (prepareError) {
    body = <p className="text-sm text-destructive">{prepareError}</p>;
  } else if (!prepared) {
    body = <p className="text-sm text-muted-foreground">Reading the saved version…</p>;
  } else if (proposal !== null) {
    body = (
      <div className="flex min-h-0 flex-col gap-3">
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <DiffViewer
            original={prepared.content}
            modified={proposal}
            originalLabel="Saved"
            modifiedLabel="Proposed"
          />
        </div>
        {spliceError ? (
          <p className="text-sm text-destructive">
            {spliceError} Copy the proposal and edit the protected part by hand instead.
          </p>
        ) : splice === null ? (
          <p className="text-sm text-muted-foreground">
            The proposal is identical to what is saved — there is nothing to apply.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setProposal(null)} disabled={saving}>
            Back
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Discard
          </Button>
          <Button onClick={() => void apply()} disabled={saving || !splice}>
            {saving ? "Saving…" : "Apply"}
          </Button>
        </div>
      </div>
    );
  } else if (actionId === "cleanup") {
    body = (
      <ProTextAgentActionPopoverBody
        title={definition.popoverTitle}
        phase={agentAction.phase}
        isBusy={agentAction.isBusy}
        isThinking={agentAction.isThinking}
        result={agentAction.result}
        error={agentAction.error}
        agentName={agentName}
        onSelectAgent={(id) => {
          setAgentId(id);
          setAgentName(null);
        }}
        onRun={() => {
          if (!effectiveCleanupAgent) {
            toast.info(definition.chooseAgentToast);
            return;
          }
          void agentAction.run(prepared.content, effectiveCleanupAgent);
        }}
        canRun={Boolean(effectiveCleanupAgent) && !agentAction.isBusy}
        onApply={() => setProposal(agentAction.result)}
        onBack={onClose}
        onCancel={onClose}
      />
    );
  } else {
    body = (
      <ProTextareaAgentPanel
        actionId={actionId}
        agentId={agentId}
        mandateKey={
          actionId === "help" && !agentId ? PRO_TEXTAREA_HELP_DEFAULT_MANDATE_KEY : null
        }
        agentLabel={agentName}
        onAgentIdChange={(id) => setAgentId(id)}
        onAgentClear={() => setAgentId(null)}
        sourceText={prepared.content}
        onApplySourceText={(text) => setProposal(text)}
        onBack={onClose}
        onCancel={onClose}
        sourceFeature={ctx.source.type === "note" ? "notes" : ctx.source.type === "chat-message" ? "chat" : "documents"}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="flex max-h-[85dvh] w-[min(56rem,95vw)] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>{definition.popoverTitle}</DialogTitle>
          <DialogDescription>
            {proposal !== null
              ? "Review the change. Apply saves only the parts that differ; Discard leaves the saved text exactly as it is."
              : "The agent works on the saved version. Nothing changes until you review and apply."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

export default DocumentAgentReview;
