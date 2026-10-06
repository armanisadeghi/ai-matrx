"use client";

// packages/chat/src/action-requests/hooks/useToolAction.tsx — A SCREEN RUNS A TOOL.
//
// The one hook every module's screen uses to run a registered tool's actual work
// (aidream `POST /tools/screen-run`), including paid calls. A paid call above the
// organization's ask threshold comes back as an approve_spend ask; the hook shows
// THE SAME answer form agents' asks use (`ActionRequestAnswerForm`) in a dialog,
// answered through the person's own session, and on approval runs the call again
// with `spend_approval_id` — the server spends under it through its own checks.
//
//   const domain = useToolAction<ToolEnvelope<DomainOverview>>("seo_domain");
//   const outcome = await domain.run({ action: "overview", domain: "example.com" });
//   ...
//   return <>{...}{domain.approvalDialog}</>;
//
// Closing the dialog leaves the ask open (it is still on the person's pending
// list); the run resolves `dismissed` and nothing was spent.

import { useCallback, useRef, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ai-matrx/design-system";

import {
  ActionRequestAnswerForm,
  useActionRequestAnswer,
  type ActionRequestTransportResult,
} from "../components/ActionRequestAnswerForm";
import { completeActionRequestAsSelf } from "../self-service";
import {
  runScreenTool,
  type ScreenRunApproval,
  type ScreenRunError,
} from "../screen-run";

export type ToolActionOutcome<TOutput> =
  | { status: "ok"; output: TOutput; callId: string }
  | { status: "error"; error: ScreenRunError }
  /** The person declined the spend. Nothing was spent. */
  | { status: "declined" }
  /** The person closed the approval without answering. Nothing was spent. */
  | { status: "dismissed" };

type Settle = (answer: { spendApprovalId: string | null; declined: boolean }) => void;

export function useToolAction<TOutput = unknown>(toolName: string) {
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<ToolActionOutcome<TOutput> | null>(null);
  const [asking, setAsking] = useState<ScreenRunApproval | null>(null);
  const settleRef = useRef<Settle | null>(null);

  const call = useCallback(
    async (args: Record<string, unknown>, spendApprovalId?: string) => {
      const response = await runScreenTool<TOutput>({
        tool_name: toolName,
        arguments: args,
        ...(spendApprovalId ? { spend_approval_id: spendApprovalId } : {}),
      });
      return response;
    },
    [toolName],
  );

  const run = useCallback(
    async (args: Record<string, unknown>): Promise<ToolActionOutcome<TOutput>> => {
      setRunning(true);
      try {
        let response = await call(args);
        if (response.status === "needs_approval" && response.approval?.render) {
          const approval = response.approval;
          const answer = await new Promise<{ spendApprovalId: string | null; declined: boolean }>(
            (resolve) => {
              settleRef.current = resolve;
              setAsking(approval);
            },
          );
          settleRef.current = null;
          setAsking(null);
          if (answer.declined) {
            const declined: ToolActionOutcome<TOutput> = { status: "declined" };
            setLast(declined);
            return declined;
          }
          if (!answer.spendApprovalId) {
            const dismissed: ToolActionOutcome<TOutput> = { status: "dismissed" };
            setLast(dismissed);
            return dismissed;
          }
          response = await call(args, answer.spendApprovalId);
        }
        const outcome: ToolActionOutcome<TOutput> =
          response.status === "ok"
            ? { status: "ok", output: response.output as TOutput, callId: response.call_id }
            : {
                status: "error",
                error: response.error ?? {
                  error_type: response.status,
                  message:
                    response.status === "needs_approval"
                      ? "This call needs a spending approval the server did not send."
                      : "The tool failed and said nothing more.",
                  suggested_action: null,
                },
              };
        setLast(outcome);
        return outcome;
      } finally {
        setRunning(false);
      }
    },
    [call],
  );

  const approvalDialog: ReactNode = asking ? (
    <ToolActionApprovalDialog
      approval={asking}
      onSettled={(answer) => settleRef.current?.(answer)}
    />
  ) : null;

  return { run, running, last, approvalDialog };
}

/** The approve_spend form in a dialog, answered as the signed-in person. */
export function ToolActionApprovalDialog({
  approval,
  onSettled,
}: {
  approval: ScreenRunApproval;
  onSettled: Settle;
}) {
  const lastBody = useRef<ActionRequestTransportResult["body"]>(null);
  const { busy, refusal, done, submit } = useActionRequestAnswer(
    async (answer) => {
      // The ask's OWN organization, from the server's answer — never the tab's.
      const result = await completeActionRequestAsSelf(
        approval.action_request_id,
        approval.organization_id ?? "",
        answer,
      );
      lastBody.current = result.body;
      return result;
    },
    () => {
      const body = lastBody.current;
      onSettled({
        spendApprovalId: body?.spend_approval_id ?? null,
        declined: body?.approved === false,
      });
    },
  );
  const render = approval.render;
  if (!render) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onSettled({ spendApprovalId: null, declined: false });
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{render.title}</DialogTitle>
          {approval.what_it_buys ? (
            <DialogDescription>{approval.what_it_buys}</DialogDescription>
          ) : null}
        </DialogHeader>
        {done ? (
          <div className="flex items-start gap-2 p-4">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium">{done.message}</p>
          </div>
        ) : (
          <ActionRequestAnswerForm
            render={render}
            askKey={approval.action_request_id}
            busy={busy}
            refusal={refusal}
            onSubmit={submit}
            layout="card"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
