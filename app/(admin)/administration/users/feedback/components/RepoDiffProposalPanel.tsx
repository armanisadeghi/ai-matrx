"use client";

/**
 * RepoDiffProposalPanel — renders a Hindsight repo-file change proposal inside
 * the feedback detail dialog (disease D8, `common-docs/operations/agent-failure-diseases.md`).
 *
 * **Arman's ruling, 2026-08-19:** *"Have a way to make changes to skills, but it
 * has to be via a DIFF system that requires review or something like that. All
 * tracked."* This is the review surface. The tracking is the feedback row it
 * lives on; the diff is the thing a human reads before anything changes.
 *
 * 🚨 **There is no apply button, and there must never be one.** The only actor
 * that writes the file is a human, or a coding session a human started. What the
 * panel offers instead is the exact, self-contained prompt for that session —
 * the server composes it (`repo_proposals.py::coding_session_prompt`) so the
 * session that applies it needs none of the context that produced it.
 *
 * THE NO-DEAD-ENDS SHAPE (`common-docs/policies/no-dead-ends.md`). Every control
 * here does something real today. A "Launch coding session" button would be a
 * dead end — web-app session launch is not wired (`readManagedCapability` reports
 * the contract, TASK-006 wires the launch) — so the panel hands over the prompt
 * instead of pretending. When that launch lands, THIS is the one place that
 * changes.
 */

import { useState } from "react";
import { Check, Copy, FileDiff, GitBranch, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RepoDiffProposal } from "@/types/repo-diff-proposal";

function CopyButton({
  value,
  label,
  icon,
  variant = "outline",
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
  variant?: "outline" | "default";
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : icon}
      {copied ? "Copied" : label}
    </Button>
  );
}

/** One line of a unified diff, coloured by its marker. */
function DiffLine({ line }: { line: string }) {
  const tone = line.startsWith("+++")
    ? "text-muted-foreground"
    : line.startsWith("---")
      ? "text-muted-foreground"
      : line.startsWith("@@")
        ? "text-blue-600 dark:text-blue-400"
        : line.startsWith("+")
          ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
          : line.startsWith("-")
            ? "text-red-700 dark:text-red-400 bg-red-500/10"
            : "text-foreground/80";
  return <div className={`px-2 whitespace-pre ${tone}`}>{line || " "}</div>;
}

export function RepoDiffProposalPanel({
  proposal,
}: {
  proposal: RepoDiffProposal;
}) {
  const location = `${proposal.repo}/${proposal.file_path}`;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 overflow-hidden">
      <div className="px-3 py-2 border-b border-amber-500/30 flex items-center gap-2 flex-wrap">
        <FileDiff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium">
          Proposed change to a repo file
        </span>
        <Badge variant="outline" className="text-[10px]">
          {proposal.source}
        </Badge>
        <Badge
          variant="outline"
          className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400"
        >
          nothing written — review required
        </Badge>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <code className="font-mono text-xs break-all">{location}</code>
          <CopyButton
            value={location}
            label="Copy path"
            icon={<Copy className="h-3.5 w-3.5" />}
          />
        </div>

        {proposal.rationale ? (
          <div className="text-sm whitespace-pre-wrap text-foreground/90">
            {proposal.rationale}
          </div>
        ) : null}

        {proposal.has_diff ? (
          <div className="rounded border bg-background overflow-x-auto">
            <div className="font-mono text-[11px] leading-5 py-1 min-w-fit">
              {proposal.unified_diff.split("\n").map((line, i) => (
                <DiffLine key={i} line={line} />
              ))}
            </div>
          </div>
        ) : (
          /* An empty diff is a first-class state, not a rendering failure. The
             detector found something real and could not state the correction —
             saying so is the honest thing, and hiding the item would report only
             the easy half of the problem. */
          <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
            No mechanically certain correction. Either side can be the wrong one
            — the artifact may name something that was retired, or the thing may
            have been retired by mistake and belongs back. A human decides.
          </div>
        )}

        {proposal.evidence.length > 0 ? (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Evidence</div>
            <ul className="space-y-0.5">
              {proposal.evidence.map((line, i) => (
                <li key={i} className="font-mono text-[11px] break-all">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <CopyButton
            value={proposal.coding_session_prompt}
            label="Copy coding-session prompt"
            icon={<Terminal className="h-3.5 w-3.5" />}
            variant="default"
          />
          <CopyButton
            value={proposal.unified_diff}
            label="Copy diff"
            icon={<Copy className="h-3.5 w-3.5" />}
          />
          <span className="text-xs text-muted-foreground">
            Paste the prompt into a coding session — it is self-contained, and it
            tells the session to verify against the live registry before changing
            anything.
          </span>
        </div>
      </div>
    </div>
  );
}
