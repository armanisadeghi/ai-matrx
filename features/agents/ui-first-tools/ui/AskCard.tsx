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
 *   choice         — radio list (single)
 *   choice_many    — checkbox list (multi)
 *   text           — textarea
 *   secret         — password input
 *   notify         — banner with action buttons + freeform Other
 *   plan_approval  — proposed plan (title + steps) + Approve / Reject
 *   takeover       — text input asking what the user did / wants
 */

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { PendingAsk } from "../redux/pending-asks.slice";
import { resolvePendingAsk, cancelPendingAsk } from "../redux/pending-asks.slice";
import {
  resolveAskByCallId,
  cancelAskByCallId,
} from "../redux/ask-resolver-registry";
import type { AskUserResponse } from "../tools/schemas";
import { EMPTY_ASK_RESPONSE } from "../tools/schemas";
import { AskCardCountdown } from "./AskCardCountdown";

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

  function answer(response: AskUserResponse) {
    resolveAskByCallId(ask.callId, response);
    dispatch(
      resolvePendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
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

  const KindIcon = KIND_ICONS[ask.kind] ?? HelpCircle;

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
          <AskBody ask={ask} onAnswer={answer} />
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

interface AskBodyProps {
  ask: PendingAsk;
  onAnswer: (r: AskUserResponse) => void;
}

function AskBody({ ask, onAnswer }: AskBodyProps) {
  switch (ask.kind) {
    case "confirm":
      return <ConfirmBody ask={ask} onAnswer={onAnswer} />;
    case "choice":
      return <ChoiceBody ask={ask} multi={false} onAnswer={onAnswer} />;
    case "choice_many":
      return <ChoiceBody ask={ask} multi={true} onAnswer={onAnswer} />;
    case "text":
      return <TextBody ask={ask} secret={false} onAnswer={onAnswer} />;
    case "secret":
      return <TextBody ask={ask} secret={true} onAnswer={onAnswer} />;
    case "notify":
      return <NotifyBody ask={ask} onAnswer={onAnswer} />;
    case "plan_approval":
      return <PlanApprovalBody ask={ask} onAnswer={onAnswer} />;
    case "takeover":
      return <TextBody ask={ask} secret={false} onAnswer={onAnswer} />;
  }
}

function QuestionLine({ ask }: { ask: PendingAsk }) {
  return (
    <div className="flex flex-col gap-0.5">
      {ask.question && (
        <div className="font-medium text-foreground leading-snug whitespace-pre-wrap">
          {ask.question}
        </div>
      )}
      {ask.context && (
        <div className="text-xs text-muted-foreground whitespace-pre-wrap">
          {ask.context}
        </div>
      )}
    </div>
  );
}

function ConfirmBody({ ask, onAnswer }: AskBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <QuestionLine ask={ask} />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() =>
            onAnswer({ ...EMPTY_ASK_RESPONSE, confirmed: true })
          }
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onAnswer({ ...EMPTY_ASK_RESPONSE, confirmed: false })
          }
        >
          No
        </Button>
      </div>
    </div>
  );
}

function ChoiceBody({
  ask,
  multi,
  onAnswer,
}: AskBodyProps & { multi: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const options = ask.options ?? [];

  function toggle(opt: string) {
    if (multi) {
      setSelected((s) =>
        s.includes(opt) ? s.filter((x) => x !== opt) : [...s, opt],
      );
    } else {
      setSelected([opt]);
    }
  }

  function submit() {
    if (selected.length === 0) return;
    onAnswer({ ...EMPTY_ASK_RESPONSE, selected });
  }

  return (
    <div className="flex flex-col gap-2">
      <QuestionLine ask={ask} />
      {multi ? (
        <div className="flex flex-col gap-1.5">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      ) : (
        <RadioGroup
          value={selected[0] ?? ""}
          onValueChange={(v) => toggle(v)}
          className="flex flex-col gap-1.5"
        >
          {options.map((opt) => (
            <Label
              key={opt}
              htmlFor={`${ask.callId}-${opt}`}
              className="flex items-center gap-2 cursor-pointer text-sm font-normal"
            >
              <RadioGroupItem value={opt} id={`${ask.callId}-${opt}`} />
              <span>{opt}</span>
            </Label>
          ))}
        </RadioGroup>
      )}
      <div>
        <Button size="sm" onClick={submit} disabled={selected.length === 0}>
          {multi ? "Submit selection" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

function TextBody({
  ask,
  secret,
  onAnswer,
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
          Submit
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <LevelIcon
          className={cn(
            "w-4 h-4 mt-0.5 shrink-0",
            ask.level === "error" && "text-destructive",
            ask.level === "warning" && "text-amber-500",
            ask.level === "success" && "text-emerald-500",
            !ask.level && "text-muted-foreground",
          )}
        />
        <div className="flex-1 text-sm whitespace-pre-wrap">{ask.message}</div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {(ask.actions ?? []).map((a) => (
          <Button
            key={a}
            size="sm"
            variant={ask.level === "error" ? "destructive" : "secondary"}
            onClick={() => onAnswer({ ...EMPTY_ASK_RESPONSE, action: a })}
          >
            {a}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowOther((s) => !s)}
        >
          Other…
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onAnswer({ ...EMPTY_ASK_RESPONSE, action: "dismiss" })
          }
        >
          Dismiss
        </Button>
      </div>
      {showOther && (
        <div className="flex gap-2 items-center">
          <Input
            value={freeform}
            onChange={(e) => setFreeform(e.target.value)}
            placeholder="Tell the agent…"
            className="text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && freeform.trim()) {
                onAnswer({
                  ...EMPTY_ASK_RESPONSE,
                  action: "other",
                  freeform,
                });
              }
            }}
          />
          <Button
            size="sm"
            onClick={() =>
              onAnswer({ ...EMPTY_ASK_RESPONSE, action: "other", freeform })
            }
            disabled={!freeform.trim()}
          >
            Send
          </Button>
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
