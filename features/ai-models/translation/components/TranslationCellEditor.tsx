"use client";

/**
 * The cell editor: what one cell sends for every value, the structured rule,
 * and the three human actions — Approve (one click, no edit), Save & approve,
 * Archive. Every write goes through the human doors in ../data.ts; a save is
 * followed by the catalog reload so the next request uses it.
 *
 * Approving a cell that reaches more than one model first names every model it
 * covers (the honest bulk-approve pattern from masterwork's BulkApproveDialog):
 * one click on a profile or API cell is never mistaken for reading one model.
 */

import { useState } from "react";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Archive, Check } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { reloadAiCatalog } from "@/features/ai-models/catalogReload";
import {
  validateAutoNoneLaw,
  validateRuleShape,
} from "@/features/ai-models/controls/resolveControls";
import type { ControlRule } from "../../types";
import { archiveTranslationCell, saveTranslationCell } from "../data";
import {
  describeFromNumber,
  describeOff,
  describeUnset,
  describeValue,
  plainRule,
  plainSetting,
  previewValues,
  type RuleContext,
  type WireOutcome,
} from "../model";
import type {
  CellLayer,
  TranslationCellRow,
  TranslationOffering,
  TranslationSetting,
} from "../types";
import { CellStateBadge, ConflictBadge } from "./CellStateBadge";
import RuleFields from "./RuleFields";

import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export type EditorTarget = {
  layer: CellLayer;
  ownerId: string;
  ownerLabel: string;
  settingKey: string;
  cell: TranslationCellRow | null;
  /** Models an approval of this cell reaches. */
  covers: TranslationOffering[];
  /** What takes over when this cell is archived. */
  fallbackLabel: string;
  /** Starting rule for a cell that does not exist yet (a profile starts from its API's rule). */
  initialRule?: ControlRule;
  /** Member models with their own cell (shown, each openable). */
  overrides: { offering: TranslationOffering; cell: TranslationCellRow }[];
  /** No rule at any layer: the editor opens empty and says the engine is guessing. */
  missing?: boolean;
  /** The setting whose server-side processor reads this key itself. */
  consumedBy?: string | null;
  /** What the engine does today without this rule, in words. */
  today?: string;
};

const TONE_CLASS: Record<WireOutcome["tone"], string> = {
  send: "text-foreground",
  nothing: "text-muted-foreground",
  drop: "text-rose-700 dark:text-rose-300",
  computed: "text-amber-700 dark:text-amber-300",
  server: "text-sky-700 dark:text-sky-300",
};

function WireLine({ label, outcome }: { label: string; outcome: WireOutcome }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-2 border-b border-border/60 px-2 py-1 last:border-b-0">
      <span className="truncate font-mono text-xs text-muted-foreground">
        {label}
      </span>
      <span
        className={`truncate font-mono text-xs ${TONE_CLASS[outcome.tone]}`}
        title={outcome.text}
      >
        {outcome.text}
      </span>
    </div>
  );
}

function WirePreview({
  rule,
  setting,
  settingKey,
  ctx,
}: {
  rule: ControlRule;
  setting: TranslationSetting | undefined;
  settingKey: string;
  ctx: RuleContext;
}) {
  const off = describeOff(rule, settingKey, setting, ctx);
  const ladder = describeFromNumber(rule);
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <WireLine label="Not set" outcome={describeUnset(rule, settingKey)} />
      {off ? <WireLine label="Off" outcome={off} /> : null}
      {previewValues(setting, rule).map((v) => (
        <WireLine
          key={typeof v === "string" ? v : JSON.stringify(v)}
          label={typeof v === "string" ? v : JSON.stringify(v)}
          outcome={describeValue(rule, settingKey, v, ctx)}
        />
      ))}
      {setting &&
      (setting.value_type === "integer" || setting.value_type === "number") ? (
        <WireLine
          label={`${rule.clamp?.min ?? setting.canonical_min ?? "—"}–${rule.clamp?.max ?? setting.canonical_max ?? "max"}`}
          outcome={describeValue(rule, settingKey, "n", ctx)}
        />
      ) : null}
      {ladder.map((step) => (
        <WireLine key={step.range} label={step.range} outcome={step.outcome} />
      ))}
    </div>
  );
}

function stable(rule: ControlRule): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(rule));
}

export default function TranslationCellEditor({
  target,
  setting,
  onClose,
  onChanged,
  onOpenOverride,
}: {
  target: EditorTarget;
  setting: TranslationSetting | undefined;
  onClose: () => void;
  onChanged: () => void;
  onOpenOverride: (o: {
    offering: TranslationOffering;
    cell: TranslationCellRow;
  }) => void;
}) {
  const dispatch = useAppDispatch();
  const original: ControlRule =
    target.cell?.rule ?? (target.missing ? {} : (target.initialRule ?? {}));
  const [draft, setDraft] = useState<ControlRule>(original);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmNoReach, setConfirmNoReach] = useState(false);
  // A missing rule opens EMPTY, from every entry point: no way of reaching the model is chosen,
  // and nothing can be approved, until the owner picks one.
  const isMissing = !target.cell && (target.missing === true || target.initialRule === undefined);
  const [picked, setPicked] = useState(false);
  const blank = isMissing && !picked;
  const onRuleChange = (next: ControlRule) => {
    setPicked(true);
    setDraft(next);
  };

  const edited = stable(draft) !== stable(original) || (isMissing && picked);
  // Shape problems quarantine the rule server-side, so they hold the save;
  // the auto/none law is shown as a warning only.
  const blocking = validateRuleShape(draft);
  const issues = [...blocking, ...validateAutoNoneLaw(draft)];
  const cell = target.cell;
  const alreadyApproved =
    cell?.state === "approved" && !cell.conflict && !cell.rejection_fingerprint;
  const reach = target.covers.length;

  const save = async () => {
    setBusy(true);
    try {
      await saveTranslationCell({
        layer: target.layer,
        ownerId: target.ownerId,
        settingKey: target.settingKey,
        rule: draft,
        rationale: note.trim() || null,
      });
      toast.success(reach > 1 ? `Approved for ${reach} models` : "Approved");
      await dispatch(reloadAiCatalog());
      onChanged();
      onClose();
    } catch (error) {
      toast.error("Not saved", {
        description:
          error instanceof Error
            ? error.message
            : String((error as { message?: unknown })?.message ?? error),
      });
    } finally {
      setBusy(false);
      setConfirmApprove(false);
      setConfirmNoReach(false);
    }
  };

  const archive = async () => {
    if (!cell) return;
    setBusy(true);
    try {
      await archiveTranslationCell(cell.id);
      toast.success("Archived");
      await dispatch(reloadAiCatalog());
      onChanged();
      onClose();
    } catch (error) {
      toast.error("Not archived", {
        description:
          error instanceof Error
            ? error.message
            : String((error as { message?: unknown })?.message ?? error),
      });
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  };

  const requestApprove = () => {
    if (blank) return;
    if (reach === 0) setConfirmNoReach(true);
    else if (reach > 1) setConfirmApprove(true);
    else void save();
  };

  const status = cell ? cell.state : "missing";
  const approveLabel = edited || !cell ? "Save & approve" : "Approve";

  return (
    <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex min-w-0 items-center gap-2 text-base">
            <span className="truncate">{plainSetting(target.settingKey)}</span>
            <span className="truncate text-sm font-normal text-muted-foreground">
              {target.ownerLabel}
            </span>
          </SheetTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <CellStateBadge status={status} />
            {cell?.conflict ? <ConflictBadge kind="conflict" /> : null}
            {cell?.rejection_fingerprint ? (
              <ConflictBadge kind="rejection" />
            ) : null}
            {cell?.confidence != null ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(cell.confidence * 100)}% confident
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {reach === 1 ? "1 model" : `${reach} models`}
            </span>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {blank ? (
            <div className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/[0.06] px-2.5 py-2">
              <p className="text-sm font-medium">No rule yet</p>
              {target.today ? (
                <p className="text-xs text-muted-foreground">Today: {target.today}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm font-medium">
              {plainRule(draft, target.settingKey, setting, { consumedBy: target.consumedBy })}
            </p>
          )}
          {cell?.rationale ? (
            <p
              className="line-clamp-3 text-xs text-muted-foreground"
              title={cell.rationale}
            >
              {cell.rationale}
            </p>
          ) : null}
          {blank ? null : (
            <WirePreview
              rule={draft}
              setting={setting}
              settingKey={target.settingKey}
              ctx={{ consumedBy: target.consumedBy }}
            />
          )}

          {cell?.conflict?.sources?.length ? (
            <div className="space-y-1 rounded-md border border-rose-500/30 bg-rose-500/[0.06] px-2.5 py-2">
              {cell.conflict.sources.map((s, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium">{s.name ?? "Source"}</span>{" "}
                  <span className="font-mono text-muted-foreground">
                    {JSON.stringify(s.says)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <RuleFields
            rule={draft}
            setting={setting}
            onChange={onRuleChange}
            blank={blank}
          />

          {issues.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-amber-700 dark:text-amber-300">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
              <li className="list-none">
                <ErrorAlchemyMenu error={issues.join(" ")} />
              </li>
            </ul>
          ) : null}

          <ProTextarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note (optional)"
            aria-label="Note"
            className="text-xs"
          />

          {target.overrides.length > 0 ? (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Models with their own rule
              </span>
              {target.overrides.map((o) => (
                <button
                  key={o.cell.id}
                  type="button"
                  onClick={() => onOpenOverride(o)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted/50"
                >
                  <span className="truncate">{o.offering.model_name}</span>
                  <CellStateBadge status={o.cell.state} />
                </button>
              ))}
            </div>
          ) : null}

          {reach > 0 ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {reach === 1 ? "Covers 1 model" : `Covers ${reach} models`}
              </summary>
              <ul className="mt-1 space-y-0.5 pl-3">
                {target.covers.map((m) => (
                  <li key={m.id} className="truncate">
                    {m.model_name}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border px-4 py-3">
          {cell ? (
            <Button
              icon={<Archive />}
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={() => setConfirmArchive(true)}
            >
              Archive
            </Button>
          ) : (
            <span />
          )}
          {blank || (alreadyApproved && !edited) ? null : (
            <Button
              icon={<Check />}
              variant="primary"
              type="button"
              disabled={busy || blocking.length > 0}
              onClick={requestApprove}
            >
              {approveLabel}
            </Button>
          )}
        </SheetFooter>

        <ConfirmDialog
          open={confirmApprove}
          onOpenChange={setConfirmApprove}
          title={`Approve for ${reach} models?`}
          description="Every model below gets this rule on its next request."
          content={
            <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border px-2 py-1.5 text-xs">
              {target.covers.map((m) => (
                <li key={m.id} className="truncate">
                  {m.model_name}
                </li>
              ))}
            </ul>
          }
          confirmLabel={`Approve ${reach} models`}
          busy={busy}
          onConfirm={save}
        />
        <ConfirmDialog
          open={confirmNoReach}
          onOpenChange={setConfirmNoReach}
          title="Reaches no models"
          description={
            target.overrides.length > 0
              ? `Every model here has its own rule, so this changes nothing today. Save it as the fallback?`
              : "No model uses this rule today. Save it anyway?"
          }
          confirmLabel="Save anyway"
          busy={busy}
          onConfirm={save}
        />
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title="Archive this rule?"
          description={`${target.fallbackLabel} takes over on the next request.`}
          confirmLabel="Archive"
          variant="destructive"
          busy={busy}
          onConfirm={archive}
        />
      </SheetContent>
    </Sheet>
  );
}
