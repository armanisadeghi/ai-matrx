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
import { Loader2, Sparkles } from "lucide-react";
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
  selectAccumulatedText,
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
 * closes; the user can pick one the moment it appears, mid-stream. Before the
 * first parseable object, the raw generated text shows so SOMETHING moves from
 * the first token — never a dead spinner.
 */
function LiveKindResult({
  conversationId,
  expectedKind,
  uiOptions,
  onPick,
}: {
  conversationId: string;
  expectedKind: string;
  uiOptions?: KindComponentUiOptions;
  onPick: (value: unknown) => void;
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
  const textSel = useMemo(() => selectAccumulatedText(requestId), [requestId]);

  const snapshot = useAppSelector(objectSel);
  const complete = useAppSelector(completeSel);
  const streamingText = useAppSelector(textSel);

  const liveContent = useMemo(() => {
    const value = snapshot?.value;
    if (value === undefined || value === null) return null;
    const stamped =
      typeof value === "object" && !Array.isArray(value)
        ? { [KIND_KEY]: expectedKind, ...(value as Record<string, unknown>) }
        : value;
    return JSON.stringify(stamped);
  }, [snapshot, expectedKind]);

  // First tokens are streaming but no option has closed yet — show the live
  // text so the surface feels alive from the very first character.
  if (!liveContent) {
    return (
      <div className="py-2">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Thinking…
        </div>
        {streamingText ? (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground/80">
            {streamingText}
          </p>
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

  // Seed field defaults whenever the dialog opens; reset transient state.
  useEffect(() => {
    if (!open) return;
    const seeded: Record<string, string> = {};
    for (const f of fields) seeded[f.name] = f.defaultValue ?? "";
    setValues(seeded);
    setPhase("input");
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
      // useKindRequest already captured the message into `error`.
      setPhase("input");
    });
  };

  const handlePick = (value: unknown) => {
    onResolve(value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {phase === "running" ? (
          conversationId ? (
            <LiveKindResult
              conversationId={conversationId}
              expectedKind={expectedKind}
              uiOptions={uiOptions}
              onPick={handlePick}
            />
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
