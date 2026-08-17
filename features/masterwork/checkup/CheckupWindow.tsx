"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  Stethoscope,
  Undo2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { CheckupCurrentPane, CheckupProposalPane } from "./CheckupPanes";
import { CheckupFindingList } from "./CheckupFindingList";
import { useCheckup, type CheckupFilter } from "./useCheckup";
import type { CheckupProposedRule } from "./types";

/**
 * THE FINAL CHECKUP — the window an Expert opens when they feel done.
 *
 * Arman, 2026-08-17: "a button that they click that's kind of like — maybe
 * call it a final checkup… the results of it should be this unique UI that
 * comes up, and I'm thinking it's probably a window panel, and it should be
 * split down the middle… suggest rules that need to be added, rules that could
 * be modified, rules that should be removed… the user is just going through
 * very quickly and sort of approving or disapproving."
 *
 * So: a `WindowPanel` (the work stays visible behind it), split down the
 * middle — the Rulebook as it is on the left, what we suggest on the right —
 * and a keyboard flow built for speed: Y approve, N dismiss, arrows to move.
 * Nothing is written until Apply, so every decision is reversible in place.
 */

const FILTERS: { key: CheckupFilter; label: string }[] = [
  { key: "open", label: "To decide" },
  { key: "add", label: "Add" },
  { key: "modify", label: "Change" },
  { key: "remove", label: "Retire" },
  { key: "all", label: "All" },
];

/** True when the keystroke belongs to something the user is typing into. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export interface CheckupWindowProps {
  isOpen: boolean;
  onClose: () => void;
  rulebookId: string;
}

export function CheckupWindow({ isOpen, onClose, rulebookId }: CheckupWindowProps) {
  const checkup = useCheckup(rulebookId);
  const isMobile = useIsMobile();
  const [dismissNote, setDismissNote] = useState("");

  const {
    rulebook,
    loading,
    loadError,
    run,
    visible,
    filter,
    setFilter,
    counts,
    focused,
    focusFinding,
    moveFocus,
    dispositions,
    decide,
    clearDecision,
    approveFocused,
    dismissFocused,
    decidedCount,
    approvedCount,
    ruleFor,
    aiPass,
    aiEligibleCount,
    approveWithAi,
    undoAiPass,
    applying,
    apply,
    receipt,
    undoAvailable,
    undoApply,
  } = checkup;

  // The keyboard model. A professional should clear thirty findings in a
  // minute without touching the mouse, and never lose a keystroke into a
  // ProTextarea they were dictating into.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "arrowdown" || key === "j") {
        event.preventDefault();
        moveFocus(1);
      } else if (key === "arrowup" || key === "k") {
        event.preventDefault();
        moveFocus(-1);
      } else if (key === "y" || key === "enter") {
        event.preventDefault();
        approveFocused();
        moveFocus(1);
      } else if (key === "n" || key === "d") {
        event.preventDefault();
        dismissFocused();
        moveFocus(1);
      } else if (key === "u") {
        event.preventDefault();
        if (focused) clearDecision(focused.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, moveFocus, approveFocused, dismissFocused, clearDecision, focused]);

  // Reset the dismissal note as focus moves — a note belongs to one finding.
  useEffect(() => {
    setDismissNote(focused ? (dispositions[focused.id]?.note ?? "") : "");
    // Only when the focused finding itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id]);

  const chooseAlternative = useCallback(
    (alternativeIndex: number) => {
      if (!focused) return;
      decide(focused.id, {
        ...(dispositions[focused.id] ?? { decision: "approve" }),
        decision: dispositions[focused.id]?.decision ?? "approve",
        alternativeIndex,
        byAi: false,
      });
    },
    [focused, decide, dispositions],
  );

  const editProposal = useCallback(
    (proposal: CheckupProposedRule | undefined) => {
      if (!focused || !proposal) return;
      decide(focused.id, {
        ...(dispositions[focused.id] ?? { decision: "approve" }),
        decision: dispositions[focused.id]?.decision ?? "approve",
        edited: proposal,
        byAi: false,
      });
    },
    [focused, decide, dispositions],
  );

  const decision = focused ? dispositions[focused.id] : undefined;
  const totalFindings = run.findings.length;
  const progress =
    totalFindings === 0 ? 0 : Math.round((decidedCount / totalFindings) * 100);

  const body = (() => {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      );
    }
    if (loadError) {
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {loadError}
        </div>
      );
    }
    if (run.status === "idle" && totalFindings === 0 && !receipt) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Stethoscope className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Ready when you are
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              We&apos;ll read back everything you&apos;ve ever told us — your
              interviews, the sources you brought, your own corrections — and
              hold it against every rule you have. Then you say yes or no.
            </p>
          </div>
          <Button onClick={() => void run.start()}>
            <Stethoscope className="mr-1 h-4 w-4" />
            Start the checkup
          </Button>
        </div>
      );
    }
    if (run.status === "error" && totalFindings === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">{run.error}</p>
          <Button variant="outline" onClick={() => void run.start()}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Try again
          </Button>
        </div>
      );
    }
    if (totalFindings === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          {run.running ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {run.stage ?? "Reading everything you've told us…"}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Suggestions appear here as we find them — you can start
                deciding before it finishes, and a refresh picks it back up.
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium text-foreground">
                {run.summary ?? "Nothing to change — your Rulebook holds up."}
              </p>
            </>
          )}
        </div>
      );
    }
    if (!focused) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium text-foreground">
            You&apos;ve been through them all.
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {decidedCount > 0
              ? "Nothing is saved yet — press Apply to make it real."
              : "Switch to All to look at them again."}
          </p>
        </div>
      );
    }

    const currentPane = (
      <CheckupCurrentPane
        finding={focused}
        rule={ruleFor(focused)}
        rulebook={rulebook}
      />
    );
    const proposalPane = (
      <CheckupProposalPane
        finding={focused}
        disposition={decision}
        onChoose={chooseAlternative}
        onEdit={editProposal}
      />
    );

    // Split down the middle. On a phone the two halves stack (proposal first —
    // it is what the decision is about); a side-by-side split there is
    // unreadable.
    return (
      <Group
        id="masterwork-checkup-split"
        orientation={isMobile ? "vertical" : "horizontal"}
        className="min-h-0 flex-1"
      >
        <Panel
          id={isMobile ? "checkup-proposal" : "checkup-current"}
          defaultSize="50%"
          minSize="20%"
        >
          <div className="h-full overflow-y-auto">
            {isMobile ? proposalPane : currentPane}
          </div>
        </Panel>
        <Separator
          className={[
            "bg-border transition-colors focus:outline-none",
            "data-[separator=hover]:bg-primary",
            "data-[separator=active]:bg-primary",
            "data-[separator=dragging]:bg-primary",
            "[&[aria-orientation=vertical]]:w-0.5 [&[aria-orientation=vertical]]:cursor-col-resize",
            "[&[aria-orientation=horizontal]]:h-0.5 [&[aria-orientation=horizontal]]:cursor-row-resize",
          ].join(" ")}
        />
        <Panel
          id={isMobile ? "checkup-current" : "checkup-proposal"}
          defaultSize="50%"
          minSize="20%"
        >
          <div className="h-full overflow-y-auto">
            {isMobile ? currentPane : proposalPane}
          </div>
        </Panel>
      </Group>
    );
  })();

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap gap-1 border-b border-border p-1.5">
        {FILTERS.map(({ key, label }) => {
          const count =
            key === "open"
              ? counts.open
              : key === "all"
                ? counts.all
                : counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                filter === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label} {count}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CheckupFindingList
          findings={visible}
          focusedId={focused?.id ?? null}
          dispositions={dispositions}
          ruleFor={ruleFor}
          onFocus={focusFinding}
        />
      </div>
    </div>
  );

  const footer = (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      {aiPass ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-foreground">
            AI accepted {aiPass.entries.length}{" "}
            {aiPass.entries.length === 1 ? "suggestion" : "suggestions"} it was
            at least {Math.round(aiPass.threshold * 100)}% sure about — they are
            ticked in the list for you to check. Nothing is saved yet.
          </span>
          <Button size="sm" variant="ghost" className="h-6" onClick={undoAiPass}>
            <Undo2 className="mr-1 h-3 w-3" />
            Undo those
          </Button>
        </div>
      ) : null}
      {receipt ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1">
          <span className="text-xs text-foreground">
            {receipt.length === 0
              ? "Nothing changed — everything you looked at was set aside."
              : `Applied: ${receipt.map((entry) => entry.ruleName).join(", ")}`}
          </span>
          {rulebook ? (
            <Link
              href={`/masterwork/${rulebook.id}`}
              target="_blank"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              See them in your Rulebook
            </Link>
          ) : null}
          {undoAvailable ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6"
              disabled={applying}
              onClick={() => void undoApply()}
            >
              <Undo2 className="mr-1 h-3 w-3" />
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}
      {focused ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-7"
            onClick={() => {
              approveFocused();
              moveFocus(1);
            }}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Yes, do it
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => {
              dismissFocused();
              moveFocus(1);
            }}
          >
            <XCircle className="mr-1 h-3.5 w-3.5" />
            No, leave it
          </Button>
          {decision ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => clearDecision(focused.id)}
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" />
              Undo this one
            </Button>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            Y yes · N no · ↑↓ move · U undo
          </span>
        </div>
      ) : null}
      {decision?.decision === "dismiss" && focused ? (
        <ProTextarea
          value={dismissNote}
          onChange={(e) => {
            setDismissNote(e.target.value);
            decide(focused.id, { ...decision, note: e.target.value });
          }}
          autoGrow
          minHeight={44}
          placeholder="Why not? (optional — it stops us suggesting this again)"
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {decidedCount} of {totalFindings} decided
          </span>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          {run.running ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {run.stage ?? "still looking"}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {aiEligibleCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={approveWithAi}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Approve the {aiEligibleCount} we&apos;re most sure about
            </Button>
          ) : null}
          <Button
            size="sm"
            className="h-7"
            disabled={decidedCount === 0 || applying}
            onClick={() => void apply()}
          >
            {applying ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            )}
            Apply {approvedCount > 0 ? `${approvedCount} ` : ""}
            {approvedCount === 1 ? "change" : "changes"}
          </Button>
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <WindowPanel
      id="masterwork-checkup-window"
      overlayId="masterworkCheckupWindow"
      titleNode={
        <span className="flex items-center gap-1.5">
          <Stethoscope className="h-4 w-4" />
          <span className="text-sm font-medium">Final checkup</span>
          {totalFindings > 0 ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {totalFindings}
            </Badge>
          ) : null}
        </span>
      }
      actionsRight={
        totalFindings > 0 && !run.running ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6"
            onClick={() => void run.start()}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Run again
          </Button>
        ) : undefined
      }
      width={1040}
      height={680}
      minWidth={520}
      minHeight={420}
      sidebar={totalFindings > 0 ? sidebar : undefined}
      sidebarDefaultSize={240}
      sidebarMinSize={160}
      footer={footer}
      footerVariant="rich"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      {body}
    </WindowPanel>
  );
}

export default CheckupWindow;
