"use client";

/**
 * THE DUPLICATE-SKILL RESOLVER — the exemplar resolution surface.
 *
 * A `duplicate-skill` red says two render_block skills teach one kind. The
 * board could only ever restate that. This surface gives the admin the two
 * things the board never did:
 *
 *   THE INFORMATION TO DECIDE — both skills side by side, what else each one
 *   teaches, whether this kind is a `kind_edge` CHILD of a kind the skill also
 *   teaches (the usual answer: one skill is a CONTAINER merely demonstrating an
 *   embedded item), how many times each body actually demonstrates this kind,
 *   a recommendation with its reasoning shown, and a real Monaco diff of the
 *   competing bodies.
 *
 *   THE CONTROL TO FINALIZE IT — one button that declares which skill OWNS the
 *   kind. NOTHING IS DELETED OR DEACTIVATED: the declaration is written to
 *   `content_ir.kind_definition.metadata.skill_owner`, the pure doctor honours
 *   it (and so does the CLI, which already reads the same column), and clearing
 *   it brings the red straight back. A container skill keeps demonstrating its
 *   children, which is what it is for.
 *
 * Per item, never in bulk — every decision is a separate confirmed action, and
 * the recommendation is never auto-applied.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  BadgeCheck,
  Boxes,
  CircleAlert,
  Columns2,
  Loader2,
  RotateCcw,
  Target,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  DuplicateSkillCandidate,
  DuplicateSkillCase,
} from "@/features/content-ir/admin/duplicate-skill-analysis";

/**
 * Monaco is ~2MB and browser-only. ONE `next/dynamic({ssr:false})` boundary,
 * opened only when an admin actually asks to compare two bodies.
 */
const CodeDiff = dynamic(
  () => import("@/components/diff/code/CodeDiff").then((m) => m.CodeDiff),
  { ssr: false, loading: () => <Skeleton className="h-80 w-full" /> },
);

function EvidenceRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </div>
  );
}

function CandidateCard({
  candidate,
  kind,
  isDeclaredOwner,
  isRecommended,
  busy,
  onDeclare,
}: {
  candidate: DuplicateSkillCandidate;
  kind: string;
  isDeclaredOwner: boolean;
  isRecommended: boolean;
  busy: boolean;
  onDeclare: () => void;
}) {
  const isContainer = candidate.containerKinds.length > 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3",
        isDeclaredOwner
          ? "border-emerald-500/50 bg-emerald-500/5"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-foreground">
          {candidate.skillId}
        </span>
        {isDeclaredOwner && (
          <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
            <BadgeCheck className="h-3 w-3" />
            Declared owner
          </span>
        )}
        {!isDeclaredOwner && isRecommended && (
          <span className="flex shrink-0 items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
            <Target className="h-3 w-3" />
            Recommended
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">{candidate.label}</span>

      <div className="flex flex-col gap-1 border-t border-border/60 pt-2">
        <EvidenceRow label="Named for kind">
          {candidate.namedForThisKind ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              yes — follows R9 naming for {kind}
            </span>
          ) : (
            <span className="text-muted-foreground">no</span>
          )}
        </EvidenceRow>
        <EvidenceRow label="Also teaches">
          {candidate.teaches.length > 1 ? (
            <span className="font-mono">
              {candidate.teaches.filter((k) => k !== kind).join(", ")}
            </span>
          ) : (
            <span className="text-muted-foreground">
              nothing else — this kind only
            </span>
          )}
        </EvidenceRow>
        <EvidenceRow label="Relationship">
          {isContainer ? (
            <span className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
              <Boxes className="mt-0.5 h-3 w-3 shrink-0" />
              CONTAINER — it teaches{" "}
              <span className="font-mono">
                {candidate.containerKinds.join(", ")}
              </span>
              , which embed{candidate.containerKinds.length === 1 ? "s" : ""}{" "}
              <span className="font-mono">{kind}</span> as a child. It
              demonstrates this kind; it does not own it.
            </span>
          ) : (
            <span className="text-foreground">
              teaches <span className="font-mono">{kind}</span> standalone
            </span>
          )}
        </EvidenceRow>
        <EvidenceRow label="Demonstrations">
          {candidate.mentions} occurrence
          {candidate.mentions === 1 ? "" : "s"} of{" "}
          <code className="font-mono">&quot;__kind&quot;: &quot;{kind}&quot;</code> in the
          body
        </EvidenceRow>
      </div>

      <Button
        size="sm"
        variant={isDeclaredOwner ? "outline" : "default"}
        className="mt-auto"
        disabled={busy || isDeclaredOwner}
        onClick={onDeclare}
      >
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
        {isDeclaredOwner ? "Owns this kind" : "Declare this skill the owner"}
      </Button>
    </div>
  );
}

function CaseCard({ item }: { item: DuplicateSkillCase }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busySkill, setBusySkill] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [left, setLeft] = useState(item.candidates[0]?.skillId ?? "");
  const [right, setRight] = useState(item.candidates[1]?.skillId ?? "");

  async function write(skillId: string | null) {
    const supabase = createClient();
    // The RPC defaults both optional args to SQL NULL, and the generated type
    // spells "absent" as `undefined` — so CLEARING the declaration omits
    // p_skill_id rather than sending an explicit null.
    const trimmedNote = note.trim();
    const { error } = await supabase.rpc("shape_doctor_set_skill_owner", {
      p_kind: item.kind,
      p_syntax: item.syntax,
      ...(skillId ? { p_skill_id: skillId } : null),
      ...(trimmedNote ? { p_note: trimmedNote } : null),
    });
    if (error) {
      toast.error(
        `Could not record the decision for "${item.kind}": ${error.message}`,
      );
      return;
    }
    toast.success(
      skillId
        ? `"${item.kind}" (${item.syntax}) is now owned by ${skillId}.`
        : `Owner declaration cleared for "${item.kind}" (${item.syntax}) — the finding will return.`,
    );
    setNote("");
    startTransition(() => router.refresh());
  }

  async function declare(candidate: DuplicateSkillCandidate) {
    const others = item.candidates
      .filter((c) => c.skillId !== candidate.skillId)
      .map((c) => c.skillId);
    const ok = await confirm({
      title: `Declare ${candidate.skillId} the owner of "${item.kind}"?`,
      description: (
        <span className="space-y-2 text-sm">
          <span className="block">
            The Shape Doctor will treat {candidate.skillId} as the one skill
            that teaches <span className="font-mono">{item.kind}</span> in{" "}
            {item.syntax} syntax. {others.join(", ")} will be read as embedding
            it, not teaching it.
          </span>
          <span className="block text-muted-foreground">
            Nothing is deleted or deactivated — this writes a declaration on the
            kind, and you can clear it again from this page.
          </span>
        </span>
      ),
      confirmLabel: "Declare owner",
    });
    if (!ok) return;
    setBusySkill(candidate.skillId);
    try {
      await write(candidate.skillId);
    } finally {
      setBusySkill(null);
    }
  }

  async function clearOwner() {
    const ok = await confirm({
      title: `Clear the owner declaration for "${item.kind}"?`,
      description:
        "The duplicate-skill finding for this kind comes back immediately. Nothing else changes.",
      confirmLabel: "Clear declaration",
      variant: "destructive",
    });
    if (!ok) return;
    setBusySkill("__clear__");
    try {
      await write(null);
    } finally {
      setBusySkill(null);
    }
  }

  const leftBody =
    item.candidates.find((c) => c.skillId === left)?.body ?? "";
  const rightBody =
    item.candidates.find((c) => c.skillId === right)?.body ?? "";

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2">
        <Link
          href={`/administration/utilities/kind-registry/${encodeURIComponent(item.kind)}`}
          className="font-mono text-sm font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {item.kind}
        </Link>
        <span className="text-xs text-muted-foreground">{item.kindLabel}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {item.syntax}
        </span>
        <span className="text-xs text-muted-foreground">
          {item.candidates.length} competing skills
        </span>
        {item.declaredOwner && !item.declaredStale && (
          <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <BadgeCheck className="h-3.5 w-3.5" />
            resolved — owner {item.declaredOwner}
          </span>
        )}
        {item.declaredStale && (
          <span className="ml-auto flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <CircleAlert className="h-3.5 w-3.5" />
            STALE declaration: {item.declaredOwner} no longer teaches this kind
          </span>
        )}
      </header>

      <div className="flex items-start gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs">
        <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
        <span>
          <span className="font-semibold text-foreground">
            {item.recommendedOwner
              ? `Recommendation: ${item.recommendedOwner}`
              : "No recommendation"}
          </span>{" "}
          <span className="text-muted-foreground">{item.rationale}</span>
        </span>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {item.candidates.map((candidate) => (
          <CandidateCard
            key={candidate.skillId}
            candidate={candidate}
            kind={item.kind}
            isDeclaredOwner={
              !item.declaredStale && item.declaredOwner === candidate.skillId
            }
            isRecommended={item.recommendedOwner === candidate.skillId}
            busy={pending || busySkill !== null}
            onDeclare={() => void declare(candidate)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
        <label
          htmlFor={`note-${item.kind}-${item.syntax}`}
          className="text-xs text-muted-foreground"
        >
          Decision note (stored with the declaration, optional)
        </label>
        <Textarea
          id={`note-${item.kind}-${item.syntax}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Why this skill owns the kind — the next admin reads this."
          className="text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDiff((v) => !v)}
            disabled={item.candidates.length < 2}
          >
            <Columns2 className="mr-1 h-3.5 w-3.5" />
            {showDiff ? "Hide" : "Compare"} skill bodies
          </Button>
          {item.declaredOwner && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || busySkill !== null}
              onClick={() => void clearOwner()}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Clear declaration
            </Button>
          )}
        </div>
      </div>

      {showDiff && item.candidates.length >= 2 && (
        <div className="border-t border-border p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <select
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
              aria-label="Left skill"
            >
              {item.candidates.map((c) => (
                <option key={c.skillId} value={c.skillId}>
                  {c.skillId}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">vs</span>
            <select
              value={right}
              onChange={(e) => setRight(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
              aria-label="Right skill"
            >
              {item.candidates.map((c) => (
                <option key={c.skillId} value={c.skillId}>
                  {c.skillId}
                </option>
              ))}
            </select>
          </div>
          <div className="h-96">
            <CodeDiff
              original={leftBody}
              modified={rightBody}
              originalLabel={left}
              modifiedLabel={right}
              language="markdown"
              wordWrap
              className="h-full"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default function DuplicateSkillResolver({
  cases,
}: {
  cases: DuplicateSkillCase[];
}) {
  if (cases.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        No kind is currently taught by more than one render_block skill in the
        same syntax. R9 holds.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4 p-4">
      {cases.map((item) => (
        <CaseCard key={`${item.kind}-${item.syntax}`} item={item} />
      ))}
    </div>
  );
}
