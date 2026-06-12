// features/kg-suggestions/components/KgSuggestionRowItem.tsx
//
// The ONE shared decision UX for a KG suggestion, used by the popover, the
// per-slot panel, AND the global drawer. A suggestion is a real decision, so
// the card spells out everything the user needs to make it WITHOUT spelunking
// the database:
//
//   1. SOURCE — which note/task/… the entity came from, by title, with a
//      one-click "Open" that floats the source in a window panel (notes) or
//      links to it, so the user can read the knowledge it was derived from.
//   2. TARGET — the full org › scope-type › scope › item path in plain words
//      (no opaque ids), with a link to the live scope.
//   3. CHANGE — the CURRENT value vs the suggested one, with a loud warning
//      when accepting would OVERWRITE an existing (often hand-entered) value.
//      Accepting an overwrite goes through a ConfirmDialog (destructive).
//   4. CONTEXT — every field on the target scope, with the targeted one
//      highlighted, so the decision is made with the whole picture in view.
//
// Heavy-hitter rows have no slot target; they keep the lightweight
// "promote to a scope" treatment and open HeavyHitterAcceptDialog on accept.
// Accept/reject/defer come from the hook; results surface as toasts.

"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Link2,
  Network,
  StickyNote,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectKgRowMutation } from "@/lib/redux/slices/kgSuggestionsSlice";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ScopeGlyph } from "@/features/scope-system/components/ScopeGlyph";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  scopeHref,
  scopeItemHref,
} from "@/features/scope-system/utils/scopeRoutes";
import { useOpenNoteInWindow } from "@/features/notes/actions/useOpenNoteInWindow";
import { useKgSuggestionEnrichment } from "@/features/kg-suggestions/hooks/useKgSuggestionEnrichment";
import type {
  ResolvedSuggestionItem,
  ResolvedSuggestionValue,
  ResolvedSuggestionTarget,
} from "@/features/scopes/types";
import {
  isAssociationLink,
  isHeavyHitter,
  type KgAcceptResult,
  type KgMatchKind,
  type KgSuggestionRow,
} from "@/features/kg-suggestions/types";
import { HeavyHitterAcceptDialog } from "./HeavyHitterAcceptDialog";
import { extractErrorMessage } from "@/utils/errors";

const MATCH_LABEL: Partial<Record<KgMatchKind, string>> = {
  exact: "Exact match",
  fuzzy: "Fuzzy match",
  semantic: "Semantic match",
  heavy_hitter: "Recurring entity",
  "agent.orienter.association": "Suggested link",
  "agent.orienter.uncertain": "Possible link",
  "agent.slot_filler.fill_empty": "Fills empty field",
  "agent.slot_filler.improve": "Improves value",
  "agent.slot_filler.flag_conflict": "Flagged conflict",
  "agent.deep_extractor.extracted": "Extracted value",
};

function matchLabel(kind: KgMatchKind): string {
  return MATCH_LABEL[kind] ?? "Suggestion";
}

const SOURCE_KIND_LABEL: Record<string, string> = {
  note: "note",
  task: "task",
  project: "project",
  transcript: "transcript",
  scraped: "scraped page",
  cld_file: "file",
  conversation: "conversation",
  cx_message: "conversation",
  code_file: "code file",
};

export interface KgSuggestionRowItemProps {
  row: KgSuggestionRow;
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string, note?: string | null) => Promise<unknown>;
  defer: (id: string, note?: string | null) => Promise<unknown>;
  /** Compact (popover/panel) trims the all-fields context + snippet. */
  compact?: boolean;
  className?: string;
}

export function KgSuggestionRowItem({
  row,
  accept,
  reject,
  defer,
  compact = false,
  className,
}: KgSuggestionRowItemProps) {
  const mutation = useAppSelector((s) => selectKgRowMutation(s, row.id));
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const [localBusy, setLocalBusy] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const busy = localBusy || mutation !== "idle";

  const heavyHitter = isHeavyHitter(row);
  const associationLink = isAssociationLink(row);

  const { data: enrichment, loading: enriching } =
    useKgSuggestionEnrichment(row);
  const target = enrichment?.target ?? null;
  const source = enrichment?.source ?? null;

  const openNoteInWindow = useOpenNoteInWindow();

  const confidencePct = Math.round(
    Math.max(0, Math.min(1, row.confidence)) * 100,
  );

  const run = async (
    kind: "accept" | "reject" | "defer",
    fn: () => Promise<unknown>,
    successMsg: string,
  ) => {
    setLocalBusy(true);
    try {
      await fn();
      toast.success(successMsg);
    } catch (err) {
      toast.error(extractErrorMessage(err) || `Could not ${kind} suggestion`);
    } finally {
      setLocalBusy(false);
    }
  };

  // ── Heavy-hitter: keep the lightweight "promote to scope" treatment. ──
  if (heavyHitter) {
    const entityName =
      row.entity.name ?? row.suggested_value ?? "Recurring entity";
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-card px-3 py-2.5 text-sm",
          className,
        )}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <Network className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-medium text-foreground truncate max-w-[16rem]">
            {entityName}
          </span>
          {row.entity.kind ? (
            <Badge variant="outline" className="h-4 text-[10px] px-1.5">
              {row.entity.kind}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Appears across multiple sources — promote it to a scope?
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ConfidenceBar pct={confidencePct} />
          <Badge
            variant="outline"
            className="h-4 text-[10px] px-1.5 border-primary/40 text-primary"
          >
            {matchLabel("heavy_hitter")}
          </Badge>
        </div>
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <DeferControl
            busy={busy}
            onDefer={(note) =>
              void run("defer", () => defer(row.id, note), "Snoozed for 7 days")
            }
          />
          <RejectButton
            busy={busy}
            onClick={() =>
              void run("reject", () => reject(row.id), "Dismissed for 30 days")
            }
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => setScopeDialogOpen(true)}
            className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Network className="h-3 w-3" />
            Create scope
          </button>
        </div>
        <HeavyHitterAcceptDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          row={row}
          organizationId={organizationId}
        />
      </div>
    );
  }

  // ── Association link: "tag this source to an existing scope". ──
  if (associationLink) {
    const linkSourceLabel =
      SOURCE_KIND_LABEL[row.source_kind] ?? row.source_kind;
    const linkScopeHref =
      target && target.org.slug
        ? scopeHref(target.org.slug, target.scope_type, target.scope)
        : null;
    const openLinkSource = () => {
      if (source?.openableAs === "note") {
        openNoteInWindow({ noteId: source.id, title: source.title ?? "Note" });
      }
    };
    const scopeTypeLabel = target?.scope_type?.label_singular ?? null;
    const scopeName = target?.scope.name ?? null;
    const acceptVerb = scopeTypeLabel
      ? `Attach to ${scopeTypeLabel}`
      : "Attach to scope";
    // The scope type carries its own brand color + icon — lead with those, not
    // a generic blue link icon.
    const typeColor = target ? resolveColor(target.scope_type) : null;
    const sourceTitle =
      source?.title ??
      (enriching ? "Resolving source…" : `Untitled ${linkSourceLabel}`);
    return (
      <div
        className={cn(
          "rounded-lg border bg-card text-sm overflow-hidden",
          typeColor?.border ?? "border-border",
          className,
        )}
      >
        <div className="px-3 py-2.5 space-y-3">
          {/* ── Lead: WHAT we identified — "{Type} Found!" in the type color ── */}
          <div className="space-y-1">
            <div
              className={cn(
                "flex items-center gap-1.5 text-[13px] font-semibold",
                typeColor?.fg ?? "text-primary",
              )}
            >
              {target?.scope_type.icon ? (
                <ScopeGlyph
                  icon={target.scope_type.icon}
                  className="h-4 w-4 shrink-0"
                />
              ) : (
                <Link2 className="h-4 w-4 shrink-0" />
              )}
              {scopeTypeLabel ? `${scopeTypeLabel} found!` : "Scope link"}
            </div>
            <div className="text-[15px] font-semibold leading-snug break-words">
              {scopeName ? (
                <span className={typeColor?.fg ?? "text-primary"}>
                  {scopeName}
                </span>
              ) : enriching ? (
                <span className="font-normal text-muted-foreground">
                  Resolving scope…
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Suggested scope link
                </span>
              )}
            </div>
            {target ? (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-muted-foreground">Org:</span>
                <span className="font-medium text-foreground">
                  {target.org.name}
                </span>
                {linkScopeHref ? (
                  <Link
                    href={linkScopeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    View {scopeTypeLabel?.toLowerCase() ?? "scope"}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>

          {row.decision_note ? (
            <div className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-foreground/80">
              <StickyNote className="h-3.5 w-3.5 shrink-0 mt-px text-amber-500" />
              <span className="min-w-0 break-words">{row.decision_note}</span>
            </div>
          ) : null}

          {/* ── Source (where it came from) ── */}
          <div className="space-y-2 border-t border-border/60 pt-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-[5rem] shrink-0 text-muted-foreground">
                Item type
              </span>
              <span className="inline-flex items-center gap-1 text-foreground/90">
                {row.source_kind === "note" ? (
                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {capitalize(linkSourceLabel)}
              </span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="w-[5rem] shrink-0 pt-0.5 text-muted-foreground">
                Item name
              </span>
              <span className="min-w-0 flex-1 pt-0.5 text-foreground/90 truncate">
                {sourceTitle}
              </span>
              {source?.openableAs === "note" ? (
                <button
                  type="button"
                  onClick={openLinkSource}
                  className="shrink-0 inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground hover:bg-accent transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open {linkSourceLabel}
                </button>
              ) : null}
            </div>

            {row.context_snippet ? (
              <div className="text-[11px] text-foreground/70 line-clamp-2 border-l-2 border-border pl-2">
                “{row.context_snippet}”
              </div>
            ) : null}

            <div className="flex items-center gap-2 flex-wrap">
              <ConfidenceBar pct={confidencePct} />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {confidencePct}%
              </span>
              <Badge variant="outline" className="h-4 text-[10px] px-1.5">
                {matchLabel(row.match_kind)}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                Detected {formatRelative(row.created_at)}
              </span>
            </div>
          </div>

          {/* ── Actions (bottom) ── */}
          <div className="flex items-center justify-end gap-1.5 border-t border-border/60 pt-2.5">
            <DeferControl
              busy={busy}
              onDefer={(note) =>
                void run(
                  "defer",
                  () => defer(row.id, note),
                  "Snoozed for 7 days",
                )
              }
            />
            <RejectButton
              busy={busy}
              onClick={() =>
                void run(
                  "reject",
                  () => reject(row.id),
                  "Dismissed for 30 days",
                )
              }
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  "accept",
                  () => accept(row.id),
                  `Tagged to ${scopeName ?? "scope"}`,
                )
              }
              className="inline-flex items-center gap-1 rounded border border-primary bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Link2 className="h-3 w-3" />
              {acceptVerb}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Slot-fill: the rich decision card. ──
  const targetItem = target?.target_item ?? null;
  const currentValue = targetItem?.current ?? null;
  const currentDisplay = formatCurrentValue(currentValue);
  const suggestedDisplay = row.suggested_value ?? "—";
  const slotLabel =
    targetItem?.display_name ?? row.target.slot_name ?? "scope field";
  const hasExistingValue = currentDisplay !== null;
  const isOverwrite = hasExistingValue && currentDisplay !== suggestedDisplay;
  const isNoOp = hasExistingValue && currentDisplay === suggestedDisplay;

  const sourceKindLabel = SOURCE_KIND_LABEL[row.source_kind] ?? row.source_kind;

  const scopeViewHref =
    target && target.org.slug
      ? scopeHref(target.org.slug, target.scope_type, target.scope)
      : null;
  const itemViewHref =
    target && target.org.slug && targetItem
      ? scopeItemHref(
          target.org.slug,
          target.scope_type,
          target.scope,
          targetItem,
        )
      : null;

  const doAccept = () =>
    void run(
      "accept",
      () => accept(row.id),
      isOverwrite
        ? `Overwrote ${slotLabel} with “${suggestedDisplay}”`
        : `Filled ${slotLabel} with “${suggestedDisplay}”`,
    );

  const onAccept = () => {
    if (isOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    doAccept();
  };

  const openSource = () => {
    if (source?.openableAs === "note") {
      openNoteInWindow({
        noteId: source.id,
        title: source.title ?? "Note",
      });
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-sm overflow-hidden",
        isOverwrite ? "border-amber-500/40" : "border-border",
        className,
      )}
    >
      <div className="px-3 py-2.5 space-y-3">
        {/* ── Lead: the proposal, front and center ── */}
        <div className="space-y-2">
          <div className="text-[15px] font-semibold leading-snug text-foreground">
            {isOverwrite ? "Update " : ""}
            <span className="text-primary break-words">{slotLabel}</span>
            {isOverwrite || isNoOp ? "" : " found"}
            {target ? (
              <>
                {" "}
                for <span className="break-words">{target.scope.name}</span>
              </>
            ) : enriching ? (
              <span className="text-muted-foreground font-normal"> …</span>
            ) : null}
          </div>

          {/* Current / Suggested — labels visible, suggestion emphasized */}
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="w-[4.5rem] shrink-0 pt-1.5 text-[11px] text-muted-foreground">
                Current
              </span>
              <div className="min-w-0 flex-1">
                <ValueLine
                  label="Current"
                  value={currentDisplay}
                  empty={!hasExistingValue}
                  loading={enriching && !target}
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-[4.5rem] shrink-0 pt-1.5 text-[11px] font-medium text-foreground">
                Suggested
              </span>
              <div className="min-w-0 flex-1">
                <ValueLine
                  label="Suggested"
                  value={suggestedDisplay}
                  highlight
                />
              </div>
            </div>
          </div>

          {/* Overwrite / no-op warning — kept beside the values */}
          {isOverwrite ? (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>
                This replaces a value you already have
                {currentValue?.source_type === "manual"
                  ? " (entered manually)"
                  : ""}
                . Accepting overwrites it.
              </span>
            </div>
          ) : null}
          {isNoOp ? (
            <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
              The current value already matches this suggestion.
            </div>
          ) : null}

          {/* Existing decision note (deferred/decided rows in the manager) */}
          {row.decision_note ? (
            <div className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5 shrink-0 mt-px text-amber-500" />
              <span className="min-w-0 break-words">{row.decision_note}</span>
            </div>
          ) : null}

          {/* Actions — the decision, immediately under the proposal */}
          <div className="flex items-center justify-end gap-1.5">
            <DeferControl
              busy={busy}
              onDefer={(note) =>
                void run(
                  "defer",
                  () => defer(row.id, note),
                  "Snoozed for 7 days",
                )
              }
            />
            <RejectButton
              busy={busy}
              onClick={() =>
                void run(
                  "reject",
                  () => reject(row.id),
                  "Dismissed for 30 days",
                )
              }
            />
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                isOverwrite
                  ? "bg-amber-600 text-white hover:bg-amber-600/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {isOverwrite ? (
                <>
                  <AlertTriangle className="h-3 w-3" />
                  Overwrite
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  Accept
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Details (secondary — only if you care to look) ── */}
        <div className="space-y-2 border-t border-border/60 pt-2.5">
          {/* Source */}
          <div className="flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Source · found in {sourceKindLabel}
              </div>
              <div className="text-xs text-foreground/90 truncate">
                {source?.title ??
                  (enriching
                    ? "Resolving source…"
                    : `Untitled ${sourceKindLabel}`)}
              </div>
            </div>
            {source?.openableAs === "note" ? (
              <button
                type="button"
                onClick={openSource}
                className="shrink-0 inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground hover:bg-accent transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </button>
            ) : null}
          </div>

          {/* Target path */}
          {target ? (
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className="text-muted-foreground">{target.org.name}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                {target.scope_type.icon ? (
                  <ScopeGlyph
                    icon={target.scope_type.icon}
                    className="h-3 w-3"
                  />
                ) : null}
                {target.scope_type.label_singular}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              <span className="font-medium text-foreground min-w-0 break-words">
                {target.scope.name}
              </span>
              {scopeViewHref ? (
                <Link
                  href={scopeViewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline ml-1"
                >
                  View
                  <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              ) : null}
            </div>
          ) : null}

          {/* All fields on this scope (context) */}
          {!compact && target && target.items.length > 0 ? (
            <div className="rounded-md border border-border/60">
              <button
                type="button"
                onClick={() => setShowAllFields((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>
                  All {target.items.length} fields on {target.scope.name}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showAllFields && "rotate-180",
                  )}
                />
              </button>
              {showAllFields ? (
                <div className="border-t border-border/60 divide-y divide-border/40">
                  {target.items.map((it) => (
                    <FieldRow
                      key={it.id}
                      item={it}
                      isTarget={it.id === targetItem?.id}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Context snippet */}
          {!compact && row.context_snippet ? (
            <div className="text-[11px] text-muted-foreground/80 line-clamp-2 border-l-2 border-border pl-2">
              “{row.context_snippet}”
            </div>
          ) : null}

          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <ConfidenceBar pct={confidencePct} />
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {confidencePct}%
            </span>
            <Badge variant="outline" className="h-4 text-[10px] px-1.5">
              {matchLabel(row.match_kind)}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              Detected {formatRelative(row.created_at)}
            </span>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOverwrite}
        onOpenChange={(o) => !busy && setConfirmOverwrite(o)}
        title={`Overwrite ${slotLabel}?`}
        variant="destructive"
        confirmLabel="Overwrite"
        busy={busy}
        description={
          <>
            This replaces the current value of <b>{slotLabel}</b> on{" "}
            <b>{target?.scope.name ?? "this scope"}</b>.
            <br />
            <span className="text-muted-foreground">From:</span>{" "}
            <span className="font-mono break-all">{currentDisplay}</span>
            <br />
            <span className="text-muted-foreground">To:</span>{" "}
            <span className="font-mono break-all">{suggestedDisplay}</span>
            {itemViewHref ? (
              <>
                <br />
                <Link
                  href={itemViewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-xs inline-flex items-center gap-0.5 mt-1"
                >
                  Inspect this field first
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </>
            ) : null}
          </>
        }
        onConfirm={() => {
          setConfirmOverwrite(false);
          doAccept();
        }}
      />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ValueLine({
  label,
  value,
  empty = false,
  highlight = false,
  loading = false,
}: {
  label: string;
  value: string | null;
  empty?: boolean;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 text-xs break-words",
        highlight
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-muted/30",
      )}
    >
      {loading ? (
        <span className="text-muted-foreground italic">
          Loading current value…
        </span>
      ) : empty ? (
        <span className="text-muted-foreground italic">
          Empty — nothing set yet
        </span>
      ) : (
        <span
          className={cn(
            "font-mono",
            highlight ? "text-foreground font-medium" : "text-foreground/90",
          )}
        >
          {value}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function FieldRow({
  item,
  isTarget,
}: {
  item: ResolvedSuggestionItem;
  isTarget: boolean;
}) {
  const value = formatCurrentValue(item.current);
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 px-2 py-1 text-[11px]",
        isTarget && "bg-primary/10",
      )}
    >
      <span
        className={cn(
          "shrink-0",
          isTarget ? "font-semibold text-primary" : "text-muted-foreground",
        )}
      >
        {item.display_name}
      </span>
      <span
        className={cn(
          "text-right truncate font-mono",
          value ? "text-foreground/90" : "text-muted-foreground/60 italic",
        )}
        title={value ?? "empty"}
      >
        {value ?? "empty"}
      </span>
    </div>
  );
}

function ConfidenceBar({ pct }: { pct: number }) {
  return (
    <div
      className="h-1.5 w-16 rounded-full bg-muted overflow-hidden"
      aria-label={`Confidence ${pct}%`}
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Defer control. One click defers immediately (the common case); the small
 * caret opens a popover to attach an optional note the user can read later in
 * the suggestions manager.
 */
function DeferControl({
  busy,
  onDefer,
}: {
  busy: boolean;
  onDefer: (note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => onDefer(null)}
        title="Defer for 7 days"
        className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-[11px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
      >
        <Clock className="h-3 w-3" />
        Defer
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={busy}
            title="Defer and leave yourself a note"
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-[11px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
          >
            <StickyNote className="h-3 w-3" />
            Defer + note
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Snooze this and leave yourself a note for when it comes back.
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. need to confirm with the client first"
            rows={3}
            className="text-base sm:text-xs resize-none"
            style={{ fontSize: "16px" }}
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onDefer(note.trim() ? note.trim() : null);
                setNote("");
              }}
              className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Clock className="h-3 w-3" />
              Defer
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function RejectButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-[11px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
    >
      <X className="h-3 w-3" />
      Reject
    </button>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function formatCurrentValue(v: ResolvedSuggestionValue | null): string | null {
  if (!v) return null;
  if (v.value_text != null && v.value_text !== "") return v.value_text;
  if (v.value_number != null) return String(v.value_number);
  if (v.value_boolean != null) return v.value_boolean ? "Yes" : "No";
  if (v.value_json != null) {
    try {
      return JSON.stringify(v.value_json);
    } catch {
      return String(v.value_json);
    }
  }
  return null;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export default KgSuggestionRowItem;
