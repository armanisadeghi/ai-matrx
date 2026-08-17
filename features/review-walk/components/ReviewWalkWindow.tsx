"use client";

/**
 * ReviewWalkWindow — the drill-down review walk (Dynamic Agent Graph S3-A).
 *
 * A human walks DOWN from a bad output one layer at a time. Each layer shows
 * the inputs that step received and asks one question — "are these inputs
 * correct?" — with two verb-labeled answers:
 *
 *   - "These inputs are fine — the fault is HERE" → file a hindsight finding
 *     at this layer (POST /review/findings/from-walk with the full hop list).
 *   - per-input "This input is wrong" → descend into that input's producer
 *     and ask the same question one layer down.
 *
 * Multi-instance floating WindowPanel (modeled on GscDrilldownWindow): one
 * walk per walked unit, breadcrumbs to climb back up, honest stop states for
 * 404 (nothing captured) / 403 (someone else's conversation or run) — descent
 * stopping is an ANSWER, never a dead-end error toast.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Crosshair,
  Loader2,
} from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { descend, describeWalkError, findingFromWalk } from "../api";
import type {
  DescendInput,
  DescendOut,
  FindingFromWalkOut,
  RecordedHop,
  WalkLayer,
  WalkLever,
  WalkUnitKind,
} from "../types";
import { ConfidenceBadge, WalkInputCard } from "./WalkInputCard";

export interface ReviewWalkWindowProps {
  onClose: () => void;
  /** Overlay instanceId — doubles as the window-manager id. */
  instanceId: string;
  /** Cascade offset so simultaneous walks never stack occluded. */
  stackIndex?: number;
  unitKind: WalkUnitKind;
  unitId: string;
  /** The agent behind the walked conversation, when the opener knows it —
   * used for the receipt's door to `/agents/{id}/hindsight`. */
  agentId?: string | null;
  agentName?: string | null;
}

const UNIT_LABELS: Record<string, string> = {
  assistant_message: "assistant message",
  agent_request: "agent request",
  wf_node_outcome: "workflow step",
};

const LEVERS: { value: WalkLever; label: string }[] = [
  { value: "instructions", label: "Instructions" },
  { value: "resources", label: "Resources" },
  { value: "tools", label: "Tools" },
  { value: "architecture", label: "Architecture" },
];

interface FilingState {
  /** The unit the fault is being pinned on. */
  faultUnitKind: string;
  faultUnitId: string;
  /** Hop answer recorded for the CURRENT layer when filing opened. */
  currentLayerAnswer: "inputs_fine" | "input_wrong";
  currentLayerNote: string | null;
}

export default function ReviewWalkWindow(props: ReviewWalkWindowProps) {
  const {
    onClose,
    instanceId,
    stackIndex = 0,
    unitKind,
    unitId,
    agentId = null,
    agentName = null,
  } = props;

  const [layers, setLayers] = useState<WalkLayer[]>([]);
  /** hops[i] is the answer the human gave AT layers[i] before descending. */
  const [hops, setHops] = useState<RecordedHop[]>([]);
  const [filing, setFiling] = useState<FilingState | null>(null);
  const [title, setTitle] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [lever, setLever] = useState<WalkLever | "">("");
  const [filingNote, setFilingNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<FindingFromWalkOut | null>(null);

  const loadLayer = useCallback(
    async (kind: WalkUnitKind, id: string, atIndex: number) => {
      setLayers((prev) => [
        ...prev.slice(0, atIndex),
        {
          unitKind: kind,
          unitId: id,
          status: "loading",
          out: null,
          errorStatus: null,
          errorDetail: null,
        },
      ]);
      try {
        const out: DescendOut = await descend(kind, id);
        setLayers((prev) =>
          prev.map((layer, i) =>
            i === atIndex ? { ...layer, status: "loaded", out } : layer,
          ),
        );
      } catch (error) {
        const { status, detail } = describeWalkError(error);
        setLayers((prev) =>
          prev.map((layer, i) =>
            i === atIndex
              ? { ...layer, status: "error", errorStatus: status, errorDetail: detail }
              : layer,
          ),
        );
      }
    },
    [],
  );

  // Root layer.
  const rootLoaded = useRef(false);
  useEffect(() => {
    if (rootLoaded.current) return;
    rootLoaded.current = true;
    void loadLayer(unitKind, unitId, 0);
  }, [loadLayer, unitKind, unitId]);

  const current = layers[layers.length - 1] ?? null;
  const currentIndex = layers.length - 1;

  /** Climb back up: keep layers 0..index, drop deeper hops, cancel filing. */
  const jumpTo = (index: number) => {
    setLayers((prev) => prev.slice(0, index + 1));
    setHops((prev) => prev.slice(0, index));
    setFiling(null);
  };

  const handleInputWrong = (input: DescendInput, note: string | null) => {
    if (!current || current.status !== "loaded" || !current.out) return;
    const snapshotId = current.out.producer?.snapshot_id ?? null;
    const ref = input.producer.descend_ref;
    // Any kind the SERVER declares descendable is descendable here — the ref's
    // type is the server's own `UnitKind`. Re-listing the kinds locally is how
    // a walk silently stops one hop short the day a new one lands (it did:
    // workflow steps were unreachable for a day after the server served them).
    if (ref?.unit_kind) {
      // Record the answer at this layer, then descend into the producer.
      setHops((prev) => [
        ...prev,
        {
          unitKind: current.unitKind,
          unitId: current.unitId,
          answer: "input_wrong",
          note,
          snapshotId,
        },
      ]);
      void loadLayer(ref.unit_kind, ref.unit_id, layers.length);
      return;
    }
    // No descent path — the fault stops AT this input's producer. File here.
    setFiling({
      faultUnitKind: input.producer.kind,
      faultUnitId: input.producer.id ?? current.unitId,
      currentLayerAnswer: "input_wrong",
      currentLayerNote: note,
    });
    if (input.producer.kind === "tool_call" && lever === "") setLever("tools");
  };

  const handleFaultHere = () => {
    if (!current || current.status !== "loaded") return;
    setFiling({
      faultUnitKind: current.unitKind,
      faultUnitId: current.unitId,
      currentLayerAnswer: "inputs_fine",
      currentLayerNote: null,
    });
  };

  const handleSubmitFinding = async () => {
    if (!current || !filing) return;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      toast.error("Give the finding a short title (at least 3 characters)");
      return;
    }
    setSubmitting(true);
    try {
      const snapshotId =
        current.out?.producer?.snapshot_id ?? null;
      const finalHops: RecordedHop[] = [
        ...hops,
        {
          unitKind: current.unitKind,
          unitId: current.unitId,
          answer: filing.currentLayerAnswer,
          note:
            filing.currentLayerNote ??
            (filingNote.trim() ? filingNote.trim() : null),
          snapshotId,
        },
      ];
      const snapshotIds = Array.from(
        new Set(
          layers.flatMap((l) => l.out?.snapshot_refs ?? []).filter(Boolean),
        ),
      );
      const root = layers[0];
      const out = await findingFromWalk({
        unit_kind: root?.unitKind ?? unitKind,
        unit_id: root?.unitId ?? unitId,
        hops: finalHops.map((h, i) => ({
          hop: i,
          unit_kind: h.unitKind,
          unit_id: h.unitId,
          answer: h.answer,
          note: h.note,
          snapshot_id: h.snapshotId,
        })),
        fault_unit_kind: filing.faultUnitKind,
        fault_unit_id: filing.faultUnitId,
        title: trimmedTitle,
        reasoning: reasoning.trim() ? reasoning.trim() : null,
        lever: lever === "" ? null : lever,
        snapshot_ids: snapshotIds,
      });
      setReceipt(out);
      toast.success(`Finding filed: ${trimmedTitle}`);
    } catch (error) {
      const { detail } = describeWalkError(error);
      toast.error(detail || "Could not file the finding");
    } finally {
      setSubmitting(false);
    }
  };

  // Cascade so simultaneous walks land offset, never perfectly occluded.
  const cascade = (stackIndex % 8) * 32;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const rect = {
    width: Math.min(720, vw - 32),
    height: Math.min(640, vh - 32),
    x: Math.max(0, Math.min((vw - 720) / 2 + cascade, vw - 320)),
    y: Math.max(0, Math.min((vh - 640) / 4 + cascade, vh - 240)),
  };

  const hindsightHref = receipt
    ? agentId
      ? `/agents/${agentId}/hindsight?enrollment=${receipt.enrollment_id}&finding=${receipt.finding_id}`
      : `/administration/agents/hindsight?enrollment=${receipt.enrollment_id}&finding=${receipt.finding_id}`
    : null;

  return (
    <WindowPanel
      id={instanceId}
      title={`Diagnose — ${UNIT_LABELS[unitKind] ?? unitKind}`}
      initialRect={rect}
      onClose={onClose}
      overlayId="reviewWalkWindow"
      overlayInstanceId={instanceId}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        {/* Breadcrumb trail of hops walked so far — each climbs back up. */}
        {layers.length > 1 && !receipt && (
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
            {layers.map((layer, i) => (
              <span key={`${layer.unitKind}-${layer.unitId}`} className="flex items-center gap-1">
                {i > 0 && (
                  <ArrowDown className="h-3 w-3 rotate-[-90deg] text-muted-foreground" aria-hidden />
                )}
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  disabled={i === currentIndex}
                  className={cn(
                    "rounded px-1.5 py-1 text-xs",
                    i === currentIndex
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground underline-offset-2 hover:underline",
                  )}
                >
                  Hop {i}: {UNIT_LABELS[layer.unitKind] ?? layer.unitKind}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
          {receipt ? (
            <ReceiptPanel
              receipt={receipt}
              title={title.trim()}
              hindsightHref={hindsightHref}
              agentId={agentId}
              agentName={agentName}
              onClose={onClose}
            />
          ) : !current || current.status === "loading" ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading what this step received…
            </div>
          ) : current.status === "error" ? (
            <StopStatePanel
              status={current.errorStatus}
              detail={current.errorDetail}
              canGoUp={layers.length > 1}
              onGoUp={() => jumpTo(layers.length - 2)}
            />
          ) : current.out ? (
            <div className="space-y-3 p-3">
              <LayerHeader out={current.out} />

              {(current.out.notes ?? []).length > 0 && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {(current.out.notes ?? []).map((note, i) => (
                    <div key={i}>{note}</div>
                  ))}
                </div>
              )}

              {!current.out.capturable && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  No request snapshot was captured for this turn, so the exact
                  wire payload (system prompt included) can't be shown. The
                  recorded message-level inputs below are still real.
                </div>
              )}

              <div className="text-xs font-medium text-muted-foreground">
                The inputs this step had. Are they correct?
              </div>

              {(current.out.inputs ?? []).length === 0 ? (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  No recorded inputs for this unit. If the output is wrong, the
                  fault is here.
                </div>
              ) : (
                <div className="space-y-2">
                  {(current.out.inputs ?? []).map((input) => (
                    <WalkInputCard
                      key={input.key}
                      input={input}
                      disabled={submitting || filing !== null}
                      onInputWrong={handleInputWrong}
                    />
                  ))}
                </div>
              )}

              {filing ? (
                <FilingPanel
                  filing={filing}
                  title={title}
                  setTitle={setTitle}
                  reasoning={reasoning}
                  setReasoning={setReasoning}
                  lever={lever}
                  setLever={setLever}
                  filingNote={filingNote}
                  setFilingNote={setFilingNote}
                  submitting={submitting}
                  onSubmit={handleSubmitFinding}
                  onCancel={() => setFiling(null)}
                />
              ) : (
                <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
                  <Button
                    type="button"
                    className="h-10 w-full gap-1.5 sm:w-auto"
                    onClick={handleFaultHere}
                  >
                    <Crosshair className="h-4 w-4" aria-hidden />
                    These inputs are fine — the fault is HERE
                  </Button>
                  <div className="self-center text-[11px] text-muted-foreground">
                    …or mark the wrong input above to go one layer down.
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </WindowPanel>
  );
}

function LayerHeader({ out }: { out: DescendOut }) {
  const producer = out.producer;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-foreground">
          {UNIT_LABELS[out.unit.kind] ?? out.unit.kind}
        </span>
        {out.unit.status && (
          <span className="text-muted-foreground">status: {out.unit.status}</span>
        )}
        {typeof out.unit.position === "number" && (
          <span className="text-muted-foreground">turn {out.unit.position}</span>
        )}
        {producer && (
          <>
            <span className="text-muted-foreground">
              {producer.model ?? "unknown model"}
              {producer.provider ? ` · ${producer.provider}` : ""}
              {typeof producer.iteration === "number"
                ? ` · iteration ${producer.iteration}`
                : ""}
            </span>
            <ConfidenceBadge confidence={producer.confidence} />
          </>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {out.unit.conversation_id && (
          <EntityRef
            token="conversation"
            id={out.unit.conversation_id}
            name="Open the conversation"
            openInNewTab
          />
        )}
        {(out.snapshot_refs ?? []).map((snapshotId) => (
          <span
            key={snapshotId}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            title="Request snapshot id — the pinned wire payload. No snapshot viewer surface exists yet; copy the id."
          >
            <span className="font-mono">
              snapshot {snapshotId.slice(0, 8)}…
            </span>
            <CopyButton content={snapshotId} size="xs" tooltip="Copy snapshot id" />
          </span>
        ))}
      </div>
      {out.unit.error != null && (
        <div className="mt-1.5 rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
          This unit recorded an error:{" "}
          {typeof out.unit.error === "string"
            ? out.unit.error
            : JSON.stringify(out.unit.error)}
        </div>
      )}
    </div>
  );
}

function StopStatePanel({
  status,
  detail,
  canGoUp,
  onGoUp,
}: {
  status: number | null;
  detail: string | null;
  canGoUp: boolean;
  onGoUp: () => void;
}) {
  const heading =
    status === 403
      ? "This record belongs to someone else"
      : status === 404
        ? "Nothing was captured for this step"
        : status === 422
          ? "Descent stops here"
          : "Couldn't load this layer";
  // The server's own sentence always wins: it knows WHICH of the several
  // honest reasons applies (ephemeral run, pre-capture row, a step no executor
  // ran, an unowned run). These fallbacks only cover a response with no detail.
  const explanation =
    detail ??
    (status === 403
      ? "You can walk your own conversations and workflow runs; an admin can walk any."
      : status === 404
        ? "This unit is ephemeral or predates capture — there is no recorded layer to show."
        : status === 422
          ? "This layer cannot be opened."
          : "The request failed.");
  return (
    <div className="m-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {heading}
      </div>
      <p className="mt-1.5 text-xs text-amber-800/90 dark:text-amber-200/90">
        {explanation}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Reaching a wall is an answer: if the fault isn't visible above this
        point, it likely lives here. Climb back up and file the finding at the
        deepest layer you could see.
      </p>
      {canGoUp && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-9"
          onClick={onGoUp}
        >
          Back up one layer
        </Button>
      )}
    </div>
  );
}

function FilingPanel({
  filing,
  title,
  setTitle,
  reasoning,
  setReasoning,
  lever,
  setLever,
  filingNote,
  setFilingNote,
  submitting,
  onSubmit,
  onCancel,
}: {
  filing: FilingState;
  title: string;
  setTitle: (v: string) => void;
  reasoning: string;
  setReasoning: (v: string) => void;
  lever: WalkLever | "";
  setLever: (v: WalkLever | "") => void;
  filingNote: string;
  setFilingNote: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-primary/40 bg-card p-3">
      <div className="text-sm font-semibold text-foreground">
        File the finding —{" "}
        {filing.currentLayerAnswer === "inputs_fine"
          ? "the fault is at this layer"
          : `the fault is in a ${filing.faultUnitKind.replace(/_/g, " ")} this layer received`}
      </div>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          What went wrong? (title, required)
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          placeholder="e.g. Answer cites a document the user never attached"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-base text-foreground placeholder:text-muted-foreground"
          style={{ fontSize: "16px" }}
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          Why do you think so? (optional)
        </span>
        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-base text-foreground placeholder:text-muted-foreground"
          style={{ fontSize: "16px" }}
        />
      </label>
      {filing.currentLayerAnswer === "inputs_fine" && (
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Note on this layer (optional)
          </span>
          <input
            value={filingNote}
            onChange={(e) => setFilingNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-base text-foreground placeholder:text-muted-foreground"
            style={{ fontSize: "16px" }}
          />
        </label>
      )}
      <div>
        <span className="text-xs font-medium text-muted-foreground">
          Which lever should the fix pull? (optional — the system picks when
          unsure)
        </span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {LEVERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setLever(lever === option.value ? "" : option.value)
              }
              className={cn(
                "h-9 rounded-md border px-2.5 text-xs",
                lever === option.value
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <Button
          type="button"
          className="h-10 w-full gap-1.5 sm:w-auto"
          disabled={submitting || title.trim().length < 3}
          onClick={onSubmit}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          )}
          File the finding
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full sm:w-auto"
          disabled={submitting}
          onClick={onCancel}
        >
          Keep walking
        </Button>
      </div>
    </div>
  );
}

function ReceiptPanel({
  receipt,
  title,
  hindsightHref,
  agentId,
  agentName,
  onClose,
}: {
  receipt: FindingFromWalkOut;
  title: string;
  hindsightHref: string | null;
  agentId: string | null;
  agentName: string | null;
  onClose: () => void;
}) {
  return (
    <div className="m-3 space-y-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Finding filed{title ? `: ${title}` : ""}
      </div>
      <p className="text-xs text-muted-foreground">
        Your walk is now a hindsight finding on the {receipt.lever} lever
        {(receipt.snapshots_pinned ?? 0) > 0
          ? `, with ${receipt.snapshots_pinned} snapshot${receipt.snapshots_pinned === 1 ? "" : "s"} pinned as evidence`
          : ""}
        . It goes through the same review-and-apply flow as every automated
        finding.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {hindsightHref && (
          <a
            href={hindsightHref}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Open it in the improvement workspace
          </a>
        )}
        {agentId && (
          <EntityRef token="agent" id={agentId} name={agentName ?? "Open the agent"} openInNewTab />
        )}
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <span className="font-mono">finding {receipt.finding_id.slice(0, 8)}…</span>
          <CopyButton content={receipt.finding_id} size="xs" tooltip="Copy finding id" />
        </span>
      </div>
      <Button type="button" variant="outline" size="sm" className="h-9" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
