"use client";

/**
 * AskCard — renders a single PendingAsk above the chat input.
 *
 * Rendering rules (per the Matrx UX direction):
 *   1. The chat input is NEVER disabled by this card. The card sits ABOVE it
 *      in the same flex column.
 *   2. Each card has its own Answer action that resolves THAT ask alone.
 *   3. Each card also has Skip (cancels with `{cancelled: true}`).
 *   4. The user can type into the chat input freely; submitting the chat
 *      input does not affect the card.
 *   5. Timeout: a thin bar at the bottom counts down. On expiry the card
 *      resolves with `{timed_out: true}`.
 *
 * Kinds:
 *   confirm        — Yes / No
 *   choice         — radio list (single); side-by-side preview when any
 *                    option has `preview`
 *   choice_many    — checkbox list (multi)
 *   text           — textarea
 *   secret         — password input
 *   notify         — banner with action buttons + freeform Other
 *   plan_approval  — proposed plan (title + steps) + Approve / Reject
 *   takeover       — text input asking what the user did / wants
 *
 * Rich options + allow_other:
 *   - Options accept the rich `{label, description?, preview?}` shape
 *     (legacy bare strings are normalized to `{label}` upstream).
 *   - `description` renders as a muted caption below each label.
 *   - `preview` (any option, single-select only) triggers the
 *     side-by-side grid layout; the focused option's preview renders in
 *     a monospace block on the right (focus follows mouseover + selection).
 *   - `allow_other: true` appends a dashed-border "Other" option that
 *     expands to a textarea when selected; submit packs the response as
 *     `{selected: [...labels, 'Other'], freeform}`.
 *
 * Batched questions:
 *   When `batchTotal > 1`, the card shows an "N of M" pill.
 */

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCheck,
  X,
  Send,
  ShieldCheck,
  HelpCircle,
  Eye,
  EyeOff,
  Circle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { PendingAsk } from "../redux/pending-asks.slice";
import {
  resolvePendingAsk,
  cancelPendingAsk,
} from "../redux/pending-asks.slice";
import {
  resolveAskByCallId,
  cancelAskByCallId,
} from "../redux/ask-resolver-registry";
import type { AskUserResponse, UserAskOption } from "../tools/schemas";
import { EMPTY_ASK_RESPONSE } from "../tools/schemas";
import { AskCardCountdown } from "./AskCardCountdown";

const OTHER_SENTINEL = "__matrx_other__";

interface AskCardProps {
  ask: PendingAsk;
}

const LEVEL_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
} as const;

const KIND_ICONS = {
  confirm: ShieldCheck,
  choice: HelpCircle,
  choice_many: HelpCircle,
  text: HelpCircle,
  secret: ShieldCheck,
  notify: Info,
  plan_approval: CheckCheck,
  takeover: HelpCircle,
} as const;

export function AskCard({ ask }: AskCardProps) {
  const dispatch = useAppDispatch();
  // Optional freeform note merged into whatever answer the body produces.
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  // "Write message instead": bypass the structured Q&A and type a freeform reply.
  const [writeMode, setWriteMode] = useState(false);
  const [writeText, setWriteText] = useState("");

  function resolve(response: AskUserResponse) {
    resolveAskByCallId(ask.callId, response);
    dispatch(
      resolvePendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
  }

  function answer(response: AskUserResponse) {
    const note = additionalInstructions.trim();
    resolve(note ? { ...response, additional_instructions: note } : response);
  }

  function skip() {
    cancelAskByCallId(ask.callId);
    dispatch(
      cancelPendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
  }

  function sendWriteInstead() {
    const text = writeText.trim();
    if (!text) return;
    resolve({ ...EMPTY_ASK_RESPONSE, wrote_instead: true, freeform: text });
  }

  const KindIcon = KIND_ICONS[ask.kind] ?? HelpCircle;
  const showBatch =
    typeof ask.batchTotal === "number" &&
    ask.batchTotal > 1 &&
    typeof ask.batchIndex === "number";
  const isLast =
    ask.batchTotal == null ||
    ask.batchTotal <= 1 ||
    (typeof ask.batchIndex === "number" &&
      ask.batchIndex === ask.batchTotal - 1);
  // The extra escapes apply to the `user` ask tool only (notify carries its own
  // freeform Other; plan_approval / takeover have bespoke handler semantics).
  const showExtras = ask.toolName === "user" && ask.kind !== "notify";
  // The additional-instructions note rides on the FINAL card (single or last batched).
  const showNote = showExtras && isLast;

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card text-card-foreground shadow-sm",
        "px-3 py-2.5 text-sm flex flex-col gap-2 relative overflow-hidden",
        "animate-in fade-in slide-in-from-bottom-1 duration-200",
        ask.status !== "pending" && "opacity-50 pointer-events-none",
      )}
      role="region"
      aria-label={`Question from agent: ${ask.question ?? ask.message ?? ""}`}
    >
      <div className="flex items-start gap-2">
        <KindIcon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          {(ask.header || ask.context || showBatch) && (
            <div className="flex items-center gap-2 mb-1">
              {ask.header && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] uppercase tracking-wide"
                >
                  {ask.header}
                </Badge>
              )}
              {ask.context && (
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">
                  {ask.context}
                </div>
              )}
              {showBatch && (
                <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
                  {ask.batchIndex! + 1} of {ask.batchTotal}
                </span>
              )}
            </div>
          )}
          {writeMode ? (
            <WriteInsteadBody
              value={writeText}
              onChange={setWriteText}
              onSend={sendWriteInstead}
              onBack={() => {
                setWriteMode(false);
                setWriteText("");
              }}
            />
          ) : (
            <>
              <AskBody ask={ask} onAnswer={answer} isLast={isLast} />
              {showNote && (
                <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Anything else? (optional)
                  </div>
                  <Textarea
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                    placeholder="Add a note for the agent…"
                    rows={2}
                    className="text-base"
                  />
                </div>
              )}
              {showExtras && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => setWriteMode(true)}
                    className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Write message instead
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={skip}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Skip / cancel"
          aria-label="Skip this question"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {typeof ask.expiresAtMs === "number" && (
        <AskCardCountdown
          expiresAtMs={ask.expiresAtMs}
          className="absolute bottom-0 left-0 right-0 rounded-none"
        />
      )}
    </div>
  );
}

function WriteInsteadBody({
  value,
  onChange,
  onSend,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Write a message instead
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your reply to the agent…"
        rows={3}
        autoFocus
        className="text-base"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSend();
        }}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSend} disabled={!value.trim()}>
          <Send className="w-3.5 h-3.5 mr-1" />
          Send
        </Button>
        <Button size="sm" variant="ghost" onClick={onBack}>
          Back to questions
        </Button>
      </div>
    </div>
  );
}

interface AskBodyProps {
  ask: PendingAsk;
  onAnswer: (r: AskUserResponse) => void;
  /** True when this is the only / last card — drives the "Send" vs "Next" button label. */
  isLast?: boolean;
}

function AskBody({ ask, onAnswer, isLast }: AskBodyProps) {
  switch (ask.kind) {
    case "confirm":
      return <ConfirmBody ask={ask} onAnswer={onAnswer} isLast={isLast} />;
    case "choice":
      return (
        <ChoiceBody ask={ask} multi={false} onAnswer={onAnswer} isLast={isLast} />
      );
    case "choice_many":
      return (
        <ChoiceBody ask={ask} multi={true} onAnswer={onAnswer} isLast={isLast} />
      );
    case "text":
      return (
        <TextBody ask={ask} secret={false} onAnswer={onAnswer} isLast={isLast} />
      );
    case "secret":
      return (
        <TextBody ask={ask} secret={true} onAnswer={onAnswer} isLast={isLast} />
      );
    case "notify":
      return <NotifyBody ask={ask} onAnswer={onAnswer} />;
    case "plan_approval":
      return <PlanApprovalBody ask={ask} onAnswer={onAnswer} />;
    case "takeover":
      return (
        <TextBody ask={ask} secret={false} onAnswer={onAnswer} isLast={isLast} />
      );
  }
}

function QuestionLine({ ask }: { ask: PendingAsk }) {
  if (!ask.question) return null;
  return (
    <div className="font-medium text-foreground leading-snug whitespace-pre-wrap">
      {ask.question}
    </div>
  );
}

function ConfirmBody({ ask, onAnswer, isLast }: AskBodyProps) {
  const [otherMode, setOtherMode] = useState(false);
  const [otherText, setOtherText] = useState("");

  function sendOther() {
    const text = otherText.trim();
    if (!text) return;
    onAnswer({ ...EMPTY_ASK_RESPONSE, confirmed: null, freeform: text });
  }

  return (
    <div className="flex flex-col gap-2">
      <QuestionLine ask={ask} />
      {!otherMode ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => onAnswer({ ...EMPTY_ASK_RESPONSE, confirmed: true })}
          >
            Yes
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAnswer({ ...EMPTY_ASK_RESPONSE, confirmed: false })}
          >
            No
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOtherMode(true)}>
            Other…
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Type your answer…"
            rows={2}
            autoFocus
            className="text-base"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendOther();
            }}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={sendOther} disabled={!otherText.trim()}>
              {isLast === false ? "Next" : "Send"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOtherMode(false);
                setOtherText("");
              }}
            >
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceBody({
  ask,
  multi,
  onAnswer,
  isLast,
}: AskBodyProps & { multi: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(0);
  const options: UserAskOption[] = useMemo(
    () => ask.options ?? [],
    [ask.options],
  );
  // Side-by-side preview layout when ANY single-select option has a preview.
  const sideBySide = !multi && options.some((o) => o.preview);
  const focusedOption = options[focusedIdx];
  const otherSelected = selected.includes(OTHER_SENTINEL);

  function toggle(value: string) {
    if (multi) {
      setSelected((s) =>
        s.includes(value) ? s.filter((x) => x !== value) : [...s, value],
      );
    } else {
      setSelected([value]);
    }
  }

  function submit() {
    if (selected.length === 0) return;
    const hasOther = selected.includes(OTHER_SENTINEL);
    const labels = selected.filter((s) => s !== OTHER_SENTINEL);
    if (hasOther) {
      if (!otherText.trim()) return;
      labels.push("Other");
      onAnswer({
        ...EMPTY_ASK_RESPONSE,
        selected: labels,
        freeform: otherText,
      });
      return;
    }
    onAnswer({ ...EMPTY_ASK_RESPONSE, selected: labels });
  }

  const canSubmit =
    selected.length > 0 && (!otherSelected || otherText.trim().length > 0);

  return (
    <div className="flex flex-col gap-2">
      <QuestionLine ask={ask} />
      <div className={sideBySide ? "grid grid-cols-[1fr_1.2fr] gap-3" : ""}>
        <div className="flex flex-col gap-1.5">
          {options.map((opt, i) => (
            <label
              key={opt.label}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-sm hover:bg-accent"
              onMouseEnter={() => setFocusedIdx(i)}
            >
              <input
                type={multi ? "checkbox" : "radio"}
                name={`ask-${ask.callId}`}
                value={opt.label}
                checked={selected.includes(opt.label)}
                onChange={() => {
                  toggle(opt.label);
                  setFocusedIdx(i);
                }}
                className="mt-0.5 size-3.5"
              />
              <div className="flex-1 min-w-0">
                <div>{opt.label}</div>
                {opt.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {opt.description}
                  </div>
                )}
              </div>
            </label>
          ))}
          {ask.allowOther && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-dashed border-border bg-background/40 px-2 py-1.5 text-sm hover:bg-accent">
              <input
                type={multi ? "checkbox" : "radio"}
                name={`ask-${ask.callId}`}
                value={OTHER_SENTINEL}
                checked={otherSelected}
                onChange={() => toggle(OTHER_SENTINEL)}
                className="mt-0.5 size-3.5"
              />
              <div className="flex-1 min-w-0">
                <div>Other</div>
                {otherSelected ? (
                  <Textarea
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    placeholder="Type your answer…"
                    rows={2}
                    className="mt-1 text-base"
                    autoFocus
                  />
                ) : (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Type a different answer
                  </div>
                )}
              </div>
            </label>
          )}
        </div>
        {sideBySide && focusedOption?.preview && (
          <pre className="overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {focusedOption.preview}
          </pre>
        )}
      </div>
      <div>
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {isLast === false ? "Next" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function TextBody({
  ask,
  secret,
  onAnswer,
  isLast,
}: AskBodyProps & { secret: boolean }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);

  function submit() {
    if (!value.trim()) return;
    onAnswer({ ...EMPTY_ASK_RESPONSE, answer: value });
    setValue("");
  }

  return (
    <div className="flex flex-col gap-2">
      <QuestionLine ask={ask} />
      {secret ? (
        <div className="relative">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter value…"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="pr-8 text-base"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={show ? "Hide value" : "Show value"}
          >
            {show ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type your answer…"
          rows={2}
          className="text-base"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
      )}
      <div className="flex gap-2 items-center">
        <Button size="sm" onClick={submit} disabled={!value.trim()}>
          <Send className="w-3.5 h-3.5 mr-1" />
          {isLast === false ? "Next" : "Send"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {secret ? "Stored only for this call." : "Cmd/Ctrl+Enter to submit"}
        </span>
      </div>
    </div>
  );
}

function NotifyBody({ ask, onAnswer }: AskBodyProps) {
  const [freeform, setFreeform] = useState("");
  const [showOther, setShowOther] = useState(false);
  const LevelIcon = LEVEL_ICONS[ask.level ?? "info"];

  function sendOther() {
    if (!freeform.trim()) return;
    onAnswer({ ...EMPTY_ASK_RESPONSE, action: "Other", freeform });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <LevelIcon
          className={cn(
            "w-4 h-4 mt-0.5 shrink-0",
            ask.level === "error" && "text-destructive",
            ask.level === "warning" && "text-amber-500",
            ask.level === "success" && "text-emerald-500",
            (!ask.level || ask.level === "info") && "text-muted-foreground",
          )}
        />
        <div className="flex-1 text-sm whitespace-pre-wrap">{ask.message}</div>
      </div>
      {!showOther && (
        <div className="flex flex-wrap gap-2 items-center">
          {(ask.actions ?? []).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={ask.level === "error" ? "destructive" : "secondary"}
              onClick={() =>
                onAnswer({ ...EMPTY_ASK_RESPONSE, action: a, freeform: null })
              }
            >
              {a}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowOther(true)}
          >
            Other…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onAnswer({
                ...EMPTY_ASK_RESPONSE,
                action: "dismiss",
                freeform: null,
              })
            }
          >
            Dismiss
          </Button>
        </div>
      )}
      {showOther && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={freeform}
            onChange={(e) => setFreeform(e.target.value)}
            placeholder="Tell the agent what happened…"
            rows={2}
            autoFocus
            className="text-base"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendOther();
            }}
          />
          <div className="flex gap-2 items-center">
            <Button size="sm" onClick={sendOther} disabled={!freeform.trim()}>
              Send
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowOther(false);
                setFreeform("");
              }}
            >
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanApprovalBody({ ask, onAnswer }: AskBodyProps) {
  const plan = ask.plan;
  return (
    <div className="flex flex-col gap-2">
      <div className="font-medium text-foreground leading-snug">
        {plan?.title ?? "Proposed plan"}
      </div>
      {plan?.reasoning && (
        <div className="text-xs text-muted-foreground whitespace-pre-wrap">
          {plan.reasoning}
        </div>
      )}
      {plan?.steps && plan.steps.length > 0 && (
        <ol className="list-decimal pl-5 space-y-0.5 text-sm">
          {plan.steps.map((s, i) => (
            <li key={i} className="text-foreground">
              {s}
            </li>
          ))}
        </ol>
      )}
      {plan?.estimated_minutes != null && (
        <div className="text-xs text-muted-foreground">
          Estimated ~{plan.estimated_minutes} min
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() =>
            onAnswer({
              ...EMPTY_ASK_RESPONSE,
              selected: ["Approve"],
              confirmed: true,
            })
          }
        >
          <CheckCheck className="w-3.5 h-3.5 mr-1" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onAnswer({
              ...EMPTY_ASK_RESPONSE,
              selected: ["Reject"],
              confirmed: false,
            })
          }
        >
          <Circle className="w-3.5 h-3.5 mr-1" />
          Reject
        </Button>
      </div>
    </div>
  );
}
