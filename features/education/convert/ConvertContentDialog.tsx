// features/education/convert/ConvertContentDialog.tsx
//
// THE one-click "turn this into a study artifact" surface — the single dialog
// primitive for every convert SOURCE (a note, a flashcard deck, an assessment, a
// passage). Sources hand it their serialized text + an origin entity token; the
// dialog drives the CANONICAL converter contract (useContentConverter →
// convertContent) — never a bespoke generation path — and each generated artifact
// links a `source` lineage edge back to the origin (written by the generator via
// recordSourceLineage, because the source ref carries the origin entity token).
// Targets light up automatically as owning projects register generators
// (isTargetAvailable).
//
// Metering uses the CANONICAL entitlement primitives (features/entitlements):
// useEntitlementGuard (check-before-spend + Paywall) + EntitlementMeter (visible
// limit BEFORE the action, TRUST mandate). No hand-rolled meter, no toast on a
// cap-hit — the guard opens CapabilityPaywallDialog instead.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Layers,
  ListChecks,
  FileCheck2,
  FileText,
  Network,
  Headphones,
  NotebookPen,
  Brain,
  ArrowRight,
  Loader2,
  Boxes,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useContentConverter } from "./useContentConverter";
import { isTargetAvailable } from "./registry";
import type { ConvertResult, ConvertSource, SourceRef, TargetKind } from "./types";
import type { Capability } from "@/features/entitlements/registry";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";

interface TargetMeta {
  kind: TargetKind;
  label: string;
  blurb: string;
  icon: typeof Layers;
  capability: Capability;
}

// Presentation for each convert target. Availability is read live from the
// converter registry (isTargetAvailable) — a target greys out as "coming soon"
// until its owning project registers a generator, then lights up with no change.
const TARGETS: TargetMeta[] = [
  {
    kind: "deck",
    label: "Flashcard deck",
    blurb: "Grounded cards you can study in every mode",
    icon: Layers,
    capability: "education.generate_cards",
  },
  {
    kind: "notes",
    label: "Structured study notes",
    blurb: "Clean, organized notes with key terms — a new note",
    icon: NotebookPen,
    capability: "education.notes_generate",
  },
  {
    kind: "quiz",
    label: "Quiz",
    blurb: "Auto-generated questions that grade on meaning",
    icon: ListChecks,
    capability: "education.quiz_generate",
  },
  {
    kind: "practice_test",
    label: "Practice test",
    blurb: "A longer, timed exam-style test",
    icon: FileCheck2,
    capability: "education.practice_test_generate",
  },
  {
    kind: "summary",
    label: "Study summary",
    blurb: "A tight, cited summary with key takeaways",
    icon: FileText,
    capability: "education.ingest_document",
  },
  {
    kind: "mind_map",
    label: "Mind map",
    blurb: "A visual concept map of the ideas",
    icon: Network,
    capability: "education.mindmap_generate",
  },
  {
    kind: "audio",
    label: "Audio overview",
    blurb: "A podcast-style overview you can listen to",
    icon: Headphones,
    capability: "education.audio_generate",
  },
  {
    kind: "memory_aid",
    label: "Memory aids",
    blurb: "Mnemonics, analogies & a memory-palace scaffold",
    icon: Brain,
    capability: "education.memory_generate",
  },
];

type RowState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ConvertResult }
  | { status: "error"; message: string };

/** The origin entity a conversion links back to (the lineage anchor). */
export interface ConvertOrigin {
  /** SourceRef kind ("note" | "deck" | "assessment" | …). */
  kind: SourceRef["kind"];
  /** Registered entity token the lineage edge points at ("note", "fc_set", "assessment"). */
  entityType: string;
  entityId: string;
  title: string;
}

export interface ConvertContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The origin entity + its display title. Drives the lineage ref. */
  origin: ConvertOrigin;
  /** The serialized text of the whole origin, ready to convert. */
  text: string;
  orgId?: string;
  /** Optional in-editor selection, if any — enables a "selected passage" toggle. */
  selectionText?: string;
  /** Targets to hide (e.g. a deck source hides "deck"). */
  excludeKinds?: TargetKind[];
  /** Called after a successful conversion so the caller can refresh lineage chips. */
  onConverted?: () => void;
}

export function ConvertContentDialog({
  open,
  onOpenChange,
  origin,
  text,
  orgId,
  selectionText,
  excludeKinds,
  onConverted,
}: ConvertContentDialogProps) {
  const router = useRouter();
  const { convert } = useContentConverter();
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();
  const hasSelection = Boolean(selectionText && selectionText.trim().length > 20);
  const [useSelection, setUseSelection] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const sourceText = useSelection && selectionText ? selectionText : text;
  const canConvert = sourceText.trim().length > 0;
  const targets = TARGETS.filter((t) => !excludeKinds?.includes(t.kind));

  // Returns true only when the conversion completed (status → done). The row's
  // guard meters the entitlement on that success; a failed conversion returns
  // false and never burns quota.
  const runConvert = async (kind: TargetKind): Promise<boolean> => {
    if (!canConvert) {
      toast.error("There's no content to convert yet.");
      return false;
    }
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts generation.
    if (!(await coppa.ensureAllowed())) return false;
    setRows((r) => ({ ...r, [kind]: { status: "running" } }));
    const source: ConvertSource = {
      text: sourceText,
      title: origin.title || "Study material",
      // The origin entity token — the generator's recordSourceLineage links the
      // artifact back to it (artifact --source--> origin).
      ref: {
        kind: origin.kind,
        entityType: origin.entityType,
        entityId: origin.entityId,
      },
    };
    try {
      const result = await convert({ source, targetKind: kind });
      setRows((r) => ({ ...r, [kind]: { status: "done", result } }));
      onConverted?.();
      toast.success(`Created "${result.title}"`, {
        action: { label: "Open", onClick: () => router.push(result.href) },
      });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setRows((r) => ({ ...r, [kind]: { status: "error", message } }));
      toast.error(message);
      return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            Turn this into study material
          </DialogTitle>
          <DialogDescription>
            Every artifact is grounded in this content and links back to it —
            nothing is siloed.
          </DialogDescription>
        </DialogHeader>

        {hasSelection && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setUseSelection(false)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                !useSelection
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Whole source
            </button>
            <button
              type="button"
              onClick={() => setUseSelection(true)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                useSelection
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Selected passage
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {targets.map((t) => (
            <TargetRow
              key={t.kind}
              meta={t}
              available={isTargetAvailable(t.kind)}
              state={rows[t.kind] ?? { status: "idle" }}
              onConvert={() => runConvert(t.kind)}
              onOpen={(href) => router.push(href)}
            />
          ))}
        </div>
        <coppa.Gate />
      </DialogContent>
    </Dialog>
  );
}

function TargetRow({
  meta,
  available,
  state,
  onConvert,
  onOpen,
}: {
  meta: TargetMeta;
  available: boolean;
  state: RowState;
  /** Runs the conversion; resolves true on success so usage is metered. */
  onConvert: () => Promise<boolean>;
  onOpen: (href: string) => void;
}) {
  // Canonical check-before-spend + paywall. `guard()` awaits the server-truth
  // verdict and opens CapabilityPaywallDialog on a block — never a toast.
  const gen = useEntitlementGuard(meta.capability);
  const Icon = meta.icon;
  const running = state.status === "running";
  const done = state.status === "done";
  const disabled = !available || running || gen.isChecking;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5",
        !available && "opacity-60",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{meta.label}</span>
          {!available && (
            <span className="rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Coming soon
            </span>
          )}
          {done && state.result.trust?.confidence && (
            <ConfidenceBadge confidence={state.result.trust.confidence} />
          )}
        </div>
        {done ? (
          <p className="truncate text-[11px] text-muted-foreground">
            {state.result.detail ?? "Created"}
          </p>
        ) : state.status === "error" ? (
          <p className="truncate text-[11px] text-destructive">{state.message}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span className="truncate">{meta.blurb}</span>
            {available && <EntitlementMeter capability={meta.capability} />}
          </div>
        )}
      </div>
      {done ? (
        <Button size="sm" variant="secondary" onClick={() => onOpen(state.result.href)}>
          Open
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            void gen.guard(async () => {
              // Meter only a successful conversion; a failure burns nothing.
              if (await onConvert()) await gen.commit();
            })
          }
          title={!available ? "This target isn't available yet" : `Convert to ${meta.label}`}
        >
          {running || gen.isChecking ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              {running ? "Working" : "Checking"}
            </>
          ) : (
            "Convert"
          )}
        </Button>
      )}
      <gen.Paywall />
    </div>
  );
}
