"use client";

/**
 * FindingRemedyCard — what a NON-TECHNICAL expert actually reads when a page
 * of theirs is flagged.
 *
 * "canonical_conflicts / score 55" is not a UI. This card is: the analyzer's
 * own sentence about what is wrong, followed by the fix — either a real
 * one-click AI action (an `AssistChip`, so the platform's INTENTIONAL-ACTION
 * LAW applies: hover expands, only the verb button runs) or an explicit,
 * copy-able instruction naming the exact change and where to make it.
 *
 * NO DEAD ENDS: every problem we detect ships with its fix, every finding can
 * reach its page (workspace + live URL), and every finding has an honest exit
 * ("this is intentional" → suppression, recorded with a reason).
 *
 * Unknown item keys are FIRST-CLASS here — `resolveFindingRemedy` never
 * returns null, so a check the server added yesterday renders completely.
 */

import { useState } from "react";
import {
  Check,
  Copy,
  EyeOff,
  ExternalLink,
  Eye,
  LayoutPanelTop,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { AssistChip } from "@/features/assists/components/AssistChip";
import { makeEphemeralAssist } from "@/features/assists/types";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  resolveFindingRemedy,
  type FindingRemedyContext,
} from "@/features/marketing/lib/finding-remedies";

export interface FindingRemedyCardProps {
  context: FindingRemedyContext;
  /** Surface the ephemeral assist chip declares (for scope/telemetry). */
  surfaceName: string;
  /** Doors to the page this finding is about. Omitted = site-level finding. */
  pageWorkspaceHref?: string | null;
  /** Suppression — omitted when the caller cannot write (e.g. a preview). */
  suppressed?: boolean;
  onSuppress?: (reason: string) => Promise<void>;
  onUnsuppress?: () => Promise<void>;
  className?: string;
}

function CopyInstructionButton({ instruction }: { instruction: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5"
      onClick={() => {
        void writeClipboard(instruction).then(() => {
          setCopied(true);
          toast.success("Instructions copied");
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy instructions"}
    </Button>
  );
}

export function FindingRemedyCard({
  context,
  surfaceName,
  pageWorkspaceHref,
  suppressed = false,
  onSuppress,
  onUnsuppress,
  className,
}: FindingRemedyCardProps) {
  const resolved = resolveFindingRemedy(context);
  const [suppressOpen, setSuppressOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const runSuppress = async (reason: string) => {
    if (!onSuppress) return;
    setBusy(true);
    try {
      await onSuppress(reason);
      setSuppressOpen(false);
      toast.success("Suppressed", {
        description: "It stays out of the priority queue until you undo this.",
      });
    } catch (error) {
      toast.error("Could not suppress this finding", {
        description: extractErrorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const runUnsuppress = async () => {
    if (!onUnsuppress) return;
    setBusy(true);
    try {
      await onUnsuppress();
      toast.success("Back in the queue");
    } catch (error) {
      toast.error("Could not restore this finding", {
        description: extractErrorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={
        className ??
        "overflow-hidden rounded-lg border border-border bg-card"
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Wrench className="h-3.5 w-3.5 shrink-0 text-primary" />
        <h2 className="text-xs font-semibold text-foreground">
          What&rsquo;s wrong, and what to do
        </h2>
        {resolved.isUnknownKey ? (
          // Honest, never hidden: this check is newer than this screen. The
          // finding still renders in full from what the database supplied.
          <Badge variant="outline" className="text-[10px]">
            New check — shown from the analyzer&rsquo;s own report
          </Badge>
        ) : null}
        {suppressed ? <Badge variant="warning">Suppressed</Badge> : null}
      </div>

      <div className="grid gap-3 p-3">
        <p className="text-sm leading-relaxed text-foreground">
          {resolved.explanation}
        </p>

        {resolved.remedy.kind === "ai" ? (
          <div className="flex flex-wrap items-center gap-2">
            <AssistChip
              assist={makeEphemeralAssist({
                sourceKey: `seo.finding.${context.itemKey}`,
                title: resolved.remedy.title,
                body: resolved.remedy.summary,
                action: resolved.remedy.action,
                surfaceName,
              })}
            />
            <span className="text-[11px] text-muted-foreground">
              {resolved.remedy.summary}
            </span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-muted/40">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {resolved.remedy.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Where: {resolved.remedy.where}
                </p>
              </div>
              <CopyInstructionButton
                instruction={resolved.remedy.instruction}
              />
            </div>
            <p className="whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed text-foreground">
              {resolved.remedy.instruction}
            </p>
          </div>
        )}

        {resolved.remedy.kind === "manual" ? (
          <p className="text-[11px] text-muted-foreground">
            {resolved.remedy.summary}
          </p>
        ) : null}

        {/* Doors — the page this finding is about, never a dead end. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {pageWorkspaceHref ? (
            <Button asChild variant="outline" size="sm" className="h-7 gap-1.5">
              <a href={pageWorkspaceHref} target="_blank" rel="noreferrer">
                <LayoutPanelTop className="h-3.5 w-3.5" />
                Open the page workspace
              </a>
            </Button>
          ) : null}
          {context.pageUrl ? (
            <Button asChild variant="outline" size="sm" className="h-7 gap-1.5">
              <a href={context.pageUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                View the live page
              </a>
            </Button>
          ) : null}
          {suppressed && onUnsuppress ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5"
              disabled={busy}
              onClick={() => void runUnsuppress()}
            >
              <Eye className="h-3.5 w-3.5" />
              Start flagging this again
            </Button>
          ) : null}
          {!suppressed && onSuppress ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5"
              disabled={busy}
              onClick={() => setSuppressOpen(true)}
            >
              <EyeOff className="h-3.5 w-3.5" />
              This is intentional
            </Button>
          ) : null}
        </div>
      </div>

      {onSuppress ? (
        <TextInputDialog
          open={suppressOpen}
          onOpenChange={setSuppressOpen}
          title="This is intentional"
          description="We'll stop flagging it and keep it out of the priority queue. Say why, so the next person reading this register knows it was a decision and not an oversight."
          placeholder="e.g. This page is deliberately hidden from search — it's a thank-you page."
          multiline
          rows={3}
          confirmLabel="Suppress this finding"
          busy={busy}
          onConfirm={runSuppress}
        />
      ) : null}
    </section>
  );
}
