// features/education/notes/ConvertNoteDialog.tsx
//
// The one-click "turn this note into a study artifact" surface (P4). Drives the
// CANONICAL converter contract (useContentConverter → convertContent) — never a
// bespoke generation path — for the whole note OR a highlighted passage, links a
// note↔artifact `source` lineage edge, and shows the result inline with its P0
// trust confidence. Targets light up automatically as owning projects register
// their generators (isTargetAvailable); metered targets show remaining BEFORE
// the action (TRUST mandate — no mid-workflow paywall).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Layers,
  ListChecks,
  FileText,
  Network,
  Headphones,
  ArrowRight,
  Loader2,
  Sparkles,
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
import { useContentConverter } from "@/features/education/convert/useContentConverter";
import { isTargetAvailable } from "@/features/education/convert/registry";
import type {
  ConvertResult,
  ConvertSource,
  TargetKind,
} from "@/features/education/convert/types";
import { useEntitlement } from "@/features/entitlements/hooks";
import type { Capability } from "@/features/entitlements/registry";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { linkArtifactToNote } from "./service";

interface TargetMeta {
  kind: TargetKind;
  label: string;
  blurb: string;
  icon: typeof Layers;
  capability: Capability;
}

// Presentation for each note-convert target. Availability is read live from the
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
    kind: "quiz",
    label: "Quiz",
    blurb: "Auto-generated questions that grade on meaning",
    icon: ListChecks,
    capability: "education.quiz_generate",
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
];

type RowState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ConvertResult }
  | { status: "error"; message: string };

export interface ConvertNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  noteTitle: string;
  noteContent: string;
  orgId?: string;
  /** Text of the current in-editor selection, if any (enables passage convert). */
  selectionText?: string;
  /** Called after a successful conversion so the caller can refresh lineage chips. */
  onConverted?: () => void;
}

export function ConvertNoteDialog({
  open,
  onOpenChange,
  noteId,
  noteTitle,
  noteContent,
  orgId,
  selectionText,
  onConverted,
}: ConvertNoteDialogProps) {
  const router = useRouter();
  const { convert } = useContentConverter();
  const hasSelection = Boolean(selectionText && selectionText.trim().length > 20);
  const [useSelection, setUseSelection] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const sourceText = useSelection && selectionText ? selectionText : noteContent;
  const canConvert = sourceText.trim().length > 0;

  const runConvert = async (kind: TargetKind) => {
    if (!canConvert) {
      toast.error("This note has no content to convert yet.");
      return;
    }
    setRows((r) => ({ ...r, [kind]: { status: "running" } }));
    const source: ConvertSource = {
      text: sourceText,
      title: noteTitle || "Note",
      ref: { kind: "note", entityType: "note", entityId: noteId },
    };
    try {
      const result = await convert({ source, targetKind: kind });
      await linkArtifactToNote(result, noteId, orgId);
      setRows((r) => ({ ...r, [kind]: { status: "done", result } }));
      onConverted?.();
      toast.success(`Created "${result.title}"`, {
        action: {
          label: "Open",
          onClick: () => router.push(result.href),
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setRows((r) => ({ ...r, [kind]: { status: "error", message } }));
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Turn this note into study material
          </DialogTitle>
          <DialogDescription>
            Every artifact is grounded in this note and links back to it — nothing
            is siloed.
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
              Whole note
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
          {TARGETS.map((t) => (
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
  onConvert: () => void;
  onOpen: (href: string) => void;
}) {
  const ent = useEntitlement(meta.capability);
  const Icon = meta.icon;
  const running = state.status === "running";
  const done = state.status === "done";
  const capReached = ent.remaining === 0;
  const disabled = !available || running || (capReached && !done);

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
        <p className="truncate text-[11px] text-muted-foreground">
          {done
            ? (state.result.detail ?? "Created")
            : state.status === "error"
              ? state.message
              : available && ent.limit != null
                ? `${meta.blurb} · ${ent.remaining ?? 0} of ${ent.limit} left`
                : meta.blurb}
        </p>
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
          onClick={onConvert}
          title={
            !available
              ? "This target isn't available yet"
              : capReached
                ? "You've reached this month's limit"
                : `Convert to ${meta.label}`
          }
        >
          {running ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Working
            </>
          ) : (
            "Convert"
          )}
        </Button>
      )}
    </div>
  );
}
