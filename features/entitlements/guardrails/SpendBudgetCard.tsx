// features/entitlements/guardrails/SpendBudgetCard.tsx
//
// The AI-spend budget card, shared by the organization settings page (mode
// "org": an owner/admin sets the organization's own ceiling) and the person's
// own settings (mode "user": they set their own). ONE component so the two
// surfaces can never drift on what a limit means or where it came from.
//
// Modelled on AWS Budgets and the OpenAI/Anthropic usage-limit pages: the
// entitlement, the self-imposed ceiling, and the effective number are three
// distinct lines, and the binding one is named. Rules this card keeps:
//   * A limit is never shown without its source.
//   * A guardrail only ever LOWERS — the database refuses one above the
//     entitlement, and that refusal (with the real ceiling) is shown verbatim.
//   * While `platform.points` is unenforced the card says TRACKING ONLY in
//     plain words. A number that stops nothing must never look like a wall.

"use client";

import { useMemo, useState } from "react";
import { Building2, Check, Gauge, Infinity as InfinityIcon, Loader2, Pencil, ShieldAlert, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  formatPoints,
  formatPointsAsMoney,
  formatUsd,
  LIMIT_SOURCE_LABEL,
  periodPhrase,
  pointsToUsd,
  removeGuardrail,
  saveGuardrail,
  usdToPoints,
  type EffectiveCapability,
  type GuardrailScope,
  type SpendGuardrail,
} from "./service";
import { useSpendBudget } from "./useSpendBudget";

interface SpendBudgetCardProps {
  organizationId: string | null | undefined;
  /** Which self-imposed layer this surface lets the viewer edit. */
  mode: GuardrailScope;
  /** Org mode: is the viewer an owner/admin of this organization? */
  canEdit: boolean;
  className?: string;
}

export function SpendBudgetCard({ organizationId, mode, canEdit, className }: SpendBudgetCardProps) {
  const { userId, effective, guardrails, loading, error, refresh } = useSpendBudget(organizationId);

  if (!organizationId) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-4 text-sm", className)}>
        <p className="text-foreground">Pick an organization to see its AI budget.</p>
        <p className="mt-1 text-xs text-muted-foreground">A budget belongs to an account, so we need to know which one you are looking at.</p>
      </div>
    );
  }

  if (loading && !effective) {
    return (
      <div className={cn("space-y-3 rounded-lg border border-border bg-card p-4", className)} aria-busy>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-1 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error || !effective) {
    return (
      <div className={cn("rounded-lg border border-destructive/40 bg-card p-4 text-sm", className)}>
        <p className="font-medium text-destructive">Could not load the AI budget.</p>
        <p className="mt-1 text-xs text-muted-foreground">{error ?? "The billing resolver returned nothing."}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      <Headline effective={effective} mode={mode} />
      <div className="divide-y divide-border border-t border-border">
        <EntitlementRow effective={effective} />
        <GuardrailRow
          scope="org"
          effective={effective}
          existing={guardrails.find((g) => g.scope === "org") ?? null}
          organizationId={organizationId}
          userId={userId}
          editable={mode === "org" && canEdit}
          onChanged={refresh}
        />
        <GuardrailRow
          scope="user"
          effective={effective}
          existing={guardrails.find((g) => g.scope === "user" && g.scope_user_id === userId) ?? null}
          organizationId={organizationId}
          userId={userId}
          editable={mode === "user"}
          onChanged={refresh}
        />
      </div>
      {!effective.enforced ? (
        <div className="flex items-start gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>
            <span className="font-medium text-foreground">Tracking only.</span> AI spend is measured against this
            budget, but nothing is stopped when it is reached yet. Enforcement is switched on platform-wide by the
            administrator; when it is, this exact number is what applies.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Headline({ effective, mode }: { effective: EffectiveCapability; mode: GuardrailScope }) {
  // The counter the binding layer is measured on: org layers meter the
  // organization, a user guardrail meters the person.
  const used = effective.limitSource === "user_guardrail" ? effective.userUsed : effective.orgUsed;
  const limit = effective.effectiveLimit;
  const pct = limit !== null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary";
  const when = periodPhrase(effective.period);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
          AI spend
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            effective.enforced
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {effective.enforced ? "Enforced" : "Tracking only"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{formatUsd(pointsToUsd(used))}</span>
        <span className="text-sm text-muted-foreground">
          {limit === null ? (
            <span className="inline-flex items-center gap-1">
              used {when} · <InfinityIcon className="h-3.5 w-3.5" aria-hidden /> no limit
            </span>
          ) : (
            <>of {formatUsd(pointsToUsd(limit))} {when}</>
          )}
        </span>
      </div>

      {limit !== null ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {limit !== null ? <span>Limit set by {LIMIT_SOURCE_LABEL[effective.limitSource]}</span> : null}
        {limit !== null ? <span>{formatPoints(used)} of {formatPoints(limit)}</span> : null}
        {effective.resetsAt ? (
          <span>Resets {new Date(effective.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        ) : null}
        {mode === "user" && effective.limitSource !== "user_guardrail" ? (
          <span>You: {formatUsd(pointsToUsd(effective.userUsed))} · Organization: {formatUsd(pointsToUsd(effective.orgUsed))}</span>
        ) : null}
        {effective.wouldBlock && !effective.enforced ? (
          <span className="text-warning">Over budget — would be stopped once enforcement is on</span>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  children,
  binding,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  children: React.ReactNode;
  binding: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{label}</span>
          {binding ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">binding</span>
          ) : null}
        </div>
        {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-sm tabular-nums">{children}</div>
    </div>
  );
}

function EntitlementRow({ effective }: { effective: EffectiveCapability }) {
  const binding = effective.limitSource === "plan" || effective.limitSource === "addon" || effective.limitSource === "tier";
  const hint = effective.fromAddon
    ? "Plan allowance raised by an add-on"
    : effective.planName
      ? `Included in the ${effective.planName} plan`
      : "Included by your plan";
  return (
    <Row icon={Building2} label="Entitlement" hint={hint} binding={binding}>
      {effective.entitlementLimit === null ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <InfinityIcon className="h-3.5 w-3.5" aria-hidden /> Unlimited
        </span>
      ) : (
        <span className="text-foreground">{formatPointsAsMoney(effective.entitlementLimit)}</span>
      )}
    </Row>
  );
}

function GuardrailRow({
  scope,
  effective,
  existing,
  organizationId,
  userId,
  editable,
  onChanged,
}: {
  scope: GuardrailScope;
  effective: EffectiveCapability;
  existing: SpendGuardrail | null;
  organizationId: string;
  userId: string | null;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const value = scope === "org" ? effective.orgGuardrail : effective.userGuardrail;
  const binding = effective.limitSource === (scope === "org" ? "org_guardrail" : "user_guardrail");
  const label = scope === "org" ? "Organization budget" : "Your own budget";
  const Icon = scope === "org" ? Building2 : UserRound;
  const ceiling = effective.entitlementLimit;

  function beginEdit() {
    setDraft(value !== null ? String(pointsToUsd(value)) : "");
    setNote(existing?.note ?? "");
    setEditing(true);
  }

  const draftPoints = useMemo(() => {
    const n = Number(draft);
    return draft.trim() !== "" && Number.isFinite(n) && n >= 0 ? usdToPoints(n) : null;
  }, [draft]);
  const aboveCeiling = draftPoints !== null && ceiling !== null && draftPoints > ceiling;

  const hint =
    value === null
      ? scope === "org"
        ? editable
          ? "Cap what everyone in this organization can spend together"
          : "No budget set by the organization"
        : editable
          ? "Cap your own spend inside this organization"
          : "This person has not set one"
      : existing?.note
        ? existing.note
        : scope === "org"
          ? "Set by the organization — applies to every member"
          : "Applies to you only";

  async function save() {
    if (draftPoints === null) {
      toast.error("Enter a dollar amount, for example 5 or 12.50.");
      return;
    }
    if (!userId) {
      toast.error("You need to be signed in to set a budget.");
      return;
    }
    setBusy(true);
    try {
      await saveGuardrail({
        existingId: existing?.id ?? null,
        organizationId,
        scope,
        scopeUserId: scope === "user" ? userId : null,
        limitValue: draftPoints,
        note: note.trim() || null,
      });
      toast.success(`${label} set to ${formatUsd(pointsToUsd(draftPoints))} ${periodPhrase(effective.period)}`.trim());
      setEditing(false);
      await onChanged();
    } catch (err) {
      // The database's refusal names the real ceiling — show it as-is.
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await removeGuardrail(existing.id);
      toast.success(`${label} removed`);
      setEditing(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm text-foreground">{label}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">$</span>
            <Input
              autoFocus
              inputMode="decimal"
              className="w-32 pl-6 tabular-nums"
              placeholder="0.00"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label={`${label} in US dollars`}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {periodPhrase(effective.period).replace(/^this /, "per ").replace(/^today$/, "per day")}
            {draftPoints !== null ? ` · ${formatPoints(draftPoints)}` : ""}
          </span>
          <Input
            className="min-w-40 flex-1"
            placeholder="Why (optional)"
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note"
          />
          <Button size="sm" onClick={() => void save()} disabled={busy || draftPoints === null || aboveCeiling}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancel
          </Button>
          {existing ? (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove()} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove
            </Button>
          ) : null}
        </div>
        {aboveCeiling && ceiling !== null ? (
          <p className="mt-1.5 text-xs text-destructive">
            A budget can only lower your limit. This account is entitled to {formatPointsAsMoney(ceiling)}; enter that
            or less. Raising a limit is an add-on, which a platform administrator grants.
          </p>
        ) : ceiling !== null ? (
          <p className="mt-1.5 text-xs text-muted-foreground">Up to {formatUsd(pointsToUsd(ceiling))} — the entitlement is the ceiling.</p>
        ) : null}
      </div>
    );
  }

  return (
    <Row icon={Icon} label={label} hint={hint} binding={binding}>
      {value === null ? (
        <span className="text-muted-foreground">Not set</span>
      ) : (
        <span className="text-foreground">{formatPointsAsMoney(value)}</span>
      )}
      {editable ? (
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={beginEdit} aria-label={value === null ? `Set ${label}` : `Edit ${label}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          {value === null ? "Set" : "Edit"}
        </Button>
      ) : null}
    </Row>
  );
}
