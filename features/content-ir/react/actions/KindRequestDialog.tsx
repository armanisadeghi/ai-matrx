"use client";

/**
 * KindRequestDialog — the reusable "ask an agent for a typed value, pick one,
 * get it back" surface. The completion of the action loop: `runAction`
 * (surface → agent) plus the return channel (component → surface) close the
 * circle, so any screen can do `openKindRequest(...)` and receive a chosen
 * value.
 *
 * Flow: collect the declared input fields → run the agent headlessly
 * (`useKindRequest`) → render the returned kind through ITS OWN component with
 * `onResolve` wired and `uiOptions` (e.g. `selectionMode: "single"`) dictating
 * behavior → when the user picks, call `onResolve(value)` and close. The kind
 * component owns the picking; this dialog owns the round-trip and the plumbing.
 *
 * Presentation-agnostic core reused as a Dialog here; a window-panel or inline
 * host can wrap the same `useKindRequest` + the same result render.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Sparkles } from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Input } from "@/components/ui/input";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectConversationRequestIds,
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { KIND_KEY } from "../../core/kind-schema.types";
import { refreshKindComponents } from "../../registry/component-registry";
import DbKindComponent from "../db-component/DbKindComponent";
import type { KindComponentUiOptions } from "../db-component/dbKindComponentCache";
import { useKindRequest } from "./useKindRequest";

/**
 * The result, rendered LIVE from the streaming request — the whole point of
 * this dialog. As the agent streams, `selectFirstExtractedObject` yields an
 * incrementally-growing object, so each option pops in the instant its JSON
 * closes; the user can pick one the moment it appears, mid-stream.
 *
 * Before the first parseable object, the pre-result stream renders through THE
 * CANONICAL PIPELINE (`MarkdownStream` by `requestId`) — never a hand-rolled
 * read of the accumulated text. That is not a style preference: accumulated
 * text INCLUDES the model's chain-of-thought, so printing it raw dumps the
 * agent's private reasoning onto the user's screen as literal text. The
 * canonical renderer routes reasoning into its collapsed trace and shows the
 * answer as the answer.
 *
 * `onReady` reports whether a usable value exists, so the host can never blank
 * a result the user is already looking at.
 */
function LiveKindResult({
  conversationId,
  expectedKind,
  uiOptions,
  onPick,
  onHasValueChange,
}: {
  conversationId: string;
  expectedKind: string;
  uiOptions?: KindComponentUiOptions;
  onPick: (value: unknown) => void;
  onHasValueChange?: (hasValue: boolean) => void;
}) {
  // Resolve the live request from the conversation. `createRequest` dispatches
  // early inside execution — so this id appears WHILE the agent is streaming,
  // not when the run resolves.
  const idsSel = useMemo(
    () => selectConversationRequestIds(conversationId),
    [conversationId],
  );
  const requestIds = useAppSelector(idsSel);
  const requestId = requestIds.length ? requestIds[requestIds.length - 1] : "";

  const objectSel = useMemo(
    () => selectFirstExtractedObject(requestId),
    [requestId],
  );
  const completeSel = useMemo(
    () => selectJsonExtractionComplete(requestId),
    [requestId],
  );

  const snapshot = useAppSelector(objectSel);
  const complete = useAppSelector(completeSel);

  const liveContent = useMemo(() => {
    const value = snapshot?.value;
    if (value === undefined || value === null) return null;
    const stamped =
      typeof value === "object" && !Array.isArray(value)
        ? { [KIND_KEY]: expectedKind, ...(value as Record<string, unknown>) }
        : value;
    return JSON.stringify(stamped);
  }, [snapshot, expectedKind]);

  useEffect(() => {
    onHasValueChange?.(Boolean(liveContent));
  }, [liveContent, onHasValueChange]);

  // First tokens are streaming but no option has closed yet — render the live
  // stream through the canonical pipeline so the surface feels alive from the
  // first character WITHOUT leaking chain-of-thought as raw text.
  if (!liveContent) {
    return (
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Working on your ideas…
        </div>
        {requestId ? (
          <div className="max-h-48 overflow-y-auto">
            <MarkdownStream
              requestId={requestId}
              isStreamActive
              hideCopyButton
              className="text-xs"
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="py-1">
      <DbKindComponent
        content={liveContent}
        onResolve={onPick}
        uiOptions={uiOptions}
      />
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
        {complete ? (
          "Pick one to use it."
        ) : (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            Generating more — pick one anytime.
          </>
        )}
      </p>
    </div>
  );
}

export interface KindRequestField {
  /** Agent variable name this field fills. */
  name: string;
  label: string;
  placeholder?: string;
  control?: "text" | "textarea";
  defaultValue?: string;
  required?: boolean;
}

export interface KindRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  title: string;
  description?: string;
  /** Input fields collected from the user (name === agent variable name). */
  fields: KindRequestField[];
  /** Variables sent on every run regardless of input (e.g. content_format). */
  fixedVariables?: Record<string, string>;
  /** The kind the agent returns; stamped on the result if it lacks `__kind`. */
  expectedKind: string;
  /** Dictated to the result component — `{ selectionMode: "single" }` etc. */
  uiOptions?: KindComponentUiOptions;
  /** Called with the value the user chose; the dialog then closes. */
  onResolve: (value: unknown) => void;
}

type Phase = "input" | "running";

export function KindRequestDialog({
  open,
  onOpenChange,
  agentId,
  title,
  description,
  fields,
  fixedVariables,
  expectedKind,
  uiOptions,
  onResolve,
}: KindRequestDialogProps) {
  const { run, isRunning, error, conversationId, reset } = useKindRequest();
  const [phase, setPhase] = useState<Phase>("input");
  const [values, setValues] = useState<Record<string, string>>({});
  /**
   * Whether the live stream has produced something the user can actually pick.
   * THE RULE: a result the user is looking at is never taken away. A late
   * failure from the run promise (which resolves long after the first options
   * render) may only ADD a notice beside the result — it may not send the user
   * back to the form and delete a paid model call's output.
   */
  const [hasLiveValue, setHasLiveValue] = useState(false);
  const [runFailed, setRunFailed] = useState(false);

  // Seed field defaults whenever the dialog opens; reset transient state.
  useEffect(() => {
    if (!open) return;
    const seeded: Record<string, string> = {};
    for (const f of fields) seeded[f.name] = f.defaultValue ?? "";
    setValues(seeded);
    setPhase("input");
    setHasLiveValue(false);
    setRunFailed(false);
    reset();
  }, [open, fields, reset]);

  const canSubmit = useMemo(
    () =>
      !isRunning &&
      fields.every((f) => !f.required || (values[f.name] ?? "").trim().length > 0),
    [fields, values, isRunning],
  );

  const submit = () => {
    if (!canSubmit) return;
    setPhase("running");
    setHasLiveValue(false);
    setRunFailed(false);
    // Warm the component registry so the streamed result routes to its real db
    // component, not the generic viewer, on first render.
    void refreshKindComponents();
    // Fire-and-observe: we do NOT await the whole run and then reveal — the
    // running phase subscribes to the live stream and renders options as they
    // arrive. `run()` still resolves/rejects for error handling.
    void run({
      agentId,
      variables: { ...(fixedVariables ?? {}), ...values },
      expectedKind,
    }).catch(() => {
      // useKindRequest already captured the message into `error`. Flag the
      // failure — the render below decides what it means: with options on
      // screen it is a footnote, with nothing on screen it returns the form.
      setRunFailed(true);
    });
  };

  const retry = () => {
    setPhase("input");
    setHasLiveValue(false);
    setRunFailed(false);
    reset();
  };

  const handlePick = (value: unknown) => {
    onResolve(value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Sized for the RESULT, not the form: this dialog spends most of its
          life showing a set of rich option cards the user reads and compares.
          A 2xl box made five ideas a scroll-tunnel. */}
      <DialogContent
        className="max-h-[88dvh] overflow-y-auto sm:max-w-4xl lg:max-w-5xl"
        // A stray click on the backdrop must not delete a finished result the
        // user paid for and hasn't chosen from yet. Once options are on
        // screen, closing takes an explicit X / Esc.
        onPointerDownOutside={(e) => {
          if (hasLiveValue) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (hasLiveValue) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {phase === "running" && (runFailed ? hasLiveValue : true) ? (
          conversationId ? (
            <>
              <LiveKindResult
                conversationId={conversationId}
                expectedKind={expectedKind}
                uiOptions={uiOptions}
                onPick={handlePick}
                onHasValueChange={setHasLiveValue}
              />
              {runFailed ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    The agent stopped before finishing the full set. What it did
                    produce is above and still usable — pick one, or
                    <button
                      type="button"
                      onClick={retry}
                      className="ml-1 underline underline-offset-2 hover:no-underline"
                    >
                      try again
                    </button>
                    .
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            // Sub-second gap between submit and the launch returning an id.
            <div className="flex items-center gap-1.5 py-4 text-xs font-medium text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Starting…
            </div>
          )
        ) : (
          <div className="space-y-3 py-1">
            {fields.map((f) => (
              <label
                key={f.name}
                className="block text-xs font-medium text-foreground"
              >
                {f.label}
                {f.control === "text" ? (
                  <Input
                    value={values[f.name] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.name]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    className="mt-1 text-base sm:text-sm"
                    disabled={isRunning}
                  />
                ) : (
                  <ProTextarea
                    value={values[f.name] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.name]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    className="text-base sm:text-sm"
                    wrapperClassName="mt-1 w-full"
                    autoGrow
                    minHeight={84}
                    maxHeight={200}
                    enableTextStats={false}
                    disabled={isRunning}
                  />
                )}
              </label>
            ))}
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
            <DialogFooter>
              <Button onClick={submit} disabled={!canSubmit} className="gap-1.5">
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isRunning ? "Generating…" : "Generate ideas"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
