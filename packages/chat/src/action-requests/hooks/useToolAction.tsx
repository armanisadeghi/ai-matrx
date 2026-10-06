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
// Identical runs in flight share one call. While an approval is open, another
// run on the same screen answers `busy` instead of stranding it; closing the
// dialog (or leaving the screen) declines the ask — nothing is spent and no ask
// is left open.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  /** The person closed the approval without approving. It was declined for them; nothing was spent. */
  | { status: "dismissed" }
  /** Another run on this screen is waiting on an approval; this one did not start. */
  | { status: "busy"; message: string };

type Settle = (answer: { spendApprovalId: string | null; declined: boolean }) => void;

/** Identical runs in flight, app-wide: the same tool + arguments returns the run
 *  already going (a double click, a re-render, a second component, a force
 *  refresh tapped twice) instead of starting — and paying for — another. */
const IN_FLIGHT = new Map<string, Promise<ToolActionOutcome<unknown>>>();

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function toolActionKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${JSON.stringify(stable(args))}`;
}

export const APPROVAL_OPEN_MESSAGE =
  "Answer the spending approval that is open first. Nothing else ran.";

export function useToolAction<TOutput = unknown>(toolName: string) {
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<ToolActionOutcome<TOutput> | null>(null);
  const [asking, setAsking] = useState<ScreenRunApproval | null>(null);
  const settleRef = useRef<Settle | null>(null);
  const askingRef = useRef<ScreenRunApproval | null>(null);

  // Leaving the screen with an approval open: decline it (nothing is spent and
  // the person's pending list does not keep a stranded ask) and end the run.
  useEffect(
    () => () => {
      const open = askingRef.current;
      if (open) {
        void declineQuietly(open);
        settleRef.current?.({ spendApprovalId: null, declined: false });
      }
    },
    [],
  );

  const call = useCallback(
    (args: Record<string, unknown>, spendApprovalId?: string) =>
      runScreenTool<TOutput>({
        tool_name: toolName,
        arguments: args,
        ...(spendApprovalId ? { spend_approval_id: spendApprovalId } : {}),
      }),
    [toolName],
  );

  const execute = useCallback(
    async (args: Record<string, unknown>): Promise<ToolActionOutcome<TOutput>> => {
      setRunning(true);
      try {
        let response = await call(args);
        if (response.status === "needs_approval" && response.approval?.render) {
          const approval = response.approval;
          const answer = await new Promise<{ spendApprovalId: string | null; declined: boolean }>(
            (resolve) => {
              settleRef.current = resolve;
              askingRef.current = approval;
              setAsking(approval);
            },
          );
          settleRef.current = null;
          askingRef.current = null;
          setAsking(null);
          if (answer.declined) return { status: "declined" };
          if (!answer.spendApprovalId) return { status: "dismissed" };
          response = await call(args, answer.spendApprovalId);
        }
        return response.status === "ok"
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
      } finally {
        setRunning(false);
      }
    },
    [call],
  );

  const run = useCallback(
    (args: Record<string, unknown>): Promise<ToolActionOutcome<TOutput>> => {
      const key = toolActionKey(toolName, args);
      const same = IN_FLIGHT.get(key);
      if (same) return same as Promise<ToolActionOutcome<TOutput>>;
      if (askingRef.current) {
        // A different run while this screen's approval is open would strand
        // that ask: refuse it cleanly instead of starting it.
        const busy: ToolActionOutcome<TOutput> = { status: "busy", message: APPROVAL_OPEN_MESSAGE };
        setLast(busy);
        return Promise.resolve(busy);
      }
      const pending = execute(args).then((outcome) => {
        setLast(outcome);
        return outcome;
      });
      IN_FLIGHT.set(key, pending as Promise<ToolActionOutcome<unknown>>);
      const clear = () => {
        if (IN_FLIGHT.get(key) === pending) IN_FLIGHT.delete(key);
      };
      pending.then(clear, clear);
      return pending;
    },
    [execute, toolName],
  );

  const approvalDialog: ReactNode = asking ? (
    <ToolActionApprovalDialog
      approval={asking}
      onSettled={(answer) => settleRef.current?.(answer)}
    />
  ) : null;

  return { run, running, last, approvalDialog };
}

/** Close an ask nobody will answer here, as a decline. Never throws. */
async function declineQuietly(approval: ScreenRunApproval): Promise<void> {
  try {
    await completeActionRequestAsSelf(
      approval.action_request_id,
      approval.organization_id ?? "",
      { result: { approved: false } },
    );
  } catch {
    // Unreachable: the ask stays on the person's pending list, still answerable.
  }
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
        if (open || busy) return;
        // Closing without approving declines the ask, so it is not left open.
        void declineQuietly(approval);
        onSettled({ spendApprovalId: null, declined: false });
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
