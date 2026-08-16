"use client";

/**
 * Change-policy surface (C-18) — how this organization wants each kind of
 * AI-proposed change handled.
 *
 * D-16: leads with the six risk-TIER PRESETS (one action sets every row in
 * the tier); the flat per-row list is the "Advanced overrides" drawer,
 * default-collapsed, showing only diverged rows by default.
 *
 * Row 38 is floored at human-only STRUCTURALLY (resolver body) — rendered
 * here as a permanently disabled control with the explanation.
 */

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    ClipboardCheck,
    ExternalLink,
    Layers,
    Lock,
    ShieldCheck,
} from "lucide-react";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsNumberInput } from "@/components/official/settings/primitives/SettingsNumberInput";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingAnchor } from "@/features/settings/doors/SettingAnchor";
import { SettingAccessGate } from "@/features/access-gate/components/SettingAccessGate";
import { ORG_CHANGE_POLICY_SET_ACTION } from "@/features/messaging/actions/settingRequestActionRegistry";
import {
    CHANGE_HANDLING_MODE_DESCRIPTIONS,
    CHANGE_HANDLING_MODE_LABELS,
    CHANGE_HANDLING_MODE_SHORT_LABELS,
    CHANGE_HANDLING_MODES,
    CHANGE_TYPE_CATALOGUE,
    CHANGE_TYPE_TIERS,
    DEFAULT_TIMEOUT_MINUTES,
    FLOORED_CHANGE_TYPE_KEY,
    changeTypesForTier,
    defaultTimeoutExpiryFor,
    type ChangeHandlingMode,
    type ChangeTypeDef,
    type ChangeTypeTierMeta,
    type TimeoutExpiry,
} from "../catalogue";
import {
    getOrgChangePolicies,
    setOrgChangePolicy,
    type OrgChangePolicyRow,
} from "../service";

const MODE_OPTIONS = CHANGE_HANDLING_MODES.map((mode) => ({
    value: mode,
    label: CHANGE_HANDLING_MODE_SHORT_LABELS[mode],
    description: CHANGE_HANDLING_MODE_DESCRIPTIONS[mode],
}));

const EXPIRY_OPTIONS: { value: TimeoutExpiry; label: string }[] = [
    { value: "proceed", label: "Proceeds" },
    { value: "hold", label: "Holds" },
];

/** Where a change-type row's subject has a real surface, the row is a door. */
const SUBJECT_DOORS: Partial<Record<NonNullable<ChangeTypeDef["subject"]>, { href: string; label: string }>> = {
    agent: { href: "/agents", label: "Open agents" },
    orchestra: { href: "/agents", label: "Open agents" },
    tool: { href: "/tools", label: "Open tools" },
};

interface Effective {
    mode: ChangeHandlingMode;
    timeoutMinutes: number;
    timeoutExpiry: TimeoutExpiry;
    overridden: boolean;
}

function effectiveFor(row: ChangeTypeDef, override: OrgChangePolicyRow | undefined): Effective {
    if (!override) {
        return {
            mode: row.defaultMode,
            timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
            timeoutExpiry: defaultTimeoutExpiryFor(row),
            overridden: false,
        };
    }
    return {
        mode: override.handling_mode,
        timeoutMinutes: override.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES,
        timeoutExpiry: override.timeout_expiry ?? defaultTimeoutExpiryFor(row),
        overridden: true,
    };
}

export function ChangePolicySurface({
    orgId,
    orgSlugOrId,
    canManage,
}: {
    orgId: string;
    orgSlugOrId: string;
    canManage: boolean;
}) {
    const [overrides, setOverrides] = React.useState<Map<string, OrgChangePolicyRow>>(new Map());
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [showAll, setShowAll] = React.useState(false);

    const reload = React.useCallback(async () => {
        const map = await getOrgChangePolicies(orgId);
        setOverrides(map);
    }, [orgId]);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const map = await getOrgChangePolicies(orgId);
                if (!cancelled) setOverrides(map);
            } catch (err) {
                if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load change policy");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [orgId]);

    const overrideCount = React.useMemo(
        () => CHANGE_TYPE_CATALOGUE.filter((row) => overrides.has(row.key)).length,
        [overrides],
    );
    const followCount = CHANGE_TYPE_CATALOGUE.length - overrideCount;
    const divergedRows = React.useMemo(
        () => CHANGE_TYPE_CATALOGUE.filter((row) => overrides.has(row.key)),
        [overrides],
    );

    const saveRow = React.useCallback(
        async (row: ChangeTypeDef, mode: ChangeHandlingMode | null, timeoutMinutes?: number | null, timeoutExpiry?: TimeoutExpiry | null) => {
            setBusy(true);
            try {
                await setOrgChangePolicy({
                    orgId,
                    changeTypeKey: row.key,
                    handlingMode: mode,
                    timeoutMinutes: mode === "review_with_timeout" ? timeoutMinutes : null,
                    timeoutExpiry: mode === "review_with_timeout" ? timeoutExpiry : null,
                });
                await reload();
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Change policy write failed");
            } finally {
                setBusy(false);
            }
        },
        [orgId, reload],
    );

    const applyTierPreset = React.useCallback(
        async (tierMeta: ChangeTypeTierMeta, preset: string) => {
            const rows = changeTypesForTier(tierMeta.tier).filter((r) => !r.floorHumanOnly);
            setBusy(true);
            try {
                for (const row of rows) {
                    if (preset === "defaults") {
                        if (overrides.has(row.key)) {
                            await setOrgChangePolicy({ orgId, changeTypeKey: row.key, handlingMode: null });
                        }
                    } else {
                        const mode = preset as ChangeHandlingMode;
                        await setOrgChangePolicy({
                            orgId,
                            changeTypeKey: row.key,
                            handlingMode: mode,
                            timeoutMinutes: mode === "review_with_timeout" ? DEFAULT_TIMEOUT_MINUTES : null,
                            timeoutExpiry: mode === "review_with_timeout" ? tierMeta.defaultTimeoutExpiry : null,
                        });
                    }
                }
                await reload();
                toast.success(
                    preset === "defaults"
                        ? `Tier ${tierMeta.tier} back to platform defaults`
                        : `Tier ${tierMeta.tier}: every change type set to ${CHANGE_HANDLING_MODE_LABELS[preset as ChangeHandlingMode]}`,
                );
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Preset failed part-way — the rows already set kept their new mode.");
                await reload();
            } finally {
                setBusy(false);
            }
        },
        [orgId, overrides, reload],
    );

    /** The tier preset control's current value: defaults / a uniform mode / mixed. */
    const tierPresetValue = React.useCallback(
        (tierMeta: ChangeTypeTierMeta): string => {
            const rows = changeTypesForTier(tierMeta.tier).filter((r) => !r.floorHumanOnly);
            const states = rows.map((row) => {
                const o = overrides.get(row.key);
                return o ? o.handling_mode : null;
            });
            if (states.every((s) => s === null)) return "defaults";
            const first = states[0];
            if (first !== null && states.every((s) => s === first)) return first;
            return "mixed";
        },
        [overrides],
    );

    if (loading) {
        return (
            <div className="space-y-3 p-1">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <SettingsSubHeader
                icon={ShieldCheck}
                title="Change policy"
                description={`How this organization wants each kind of AI-proposed change handled. ${followCount} of ${CHANGE_TYPE_CATALOGUE.length} change types follow the platform default, ${overrideCount} customized.`}
            />

            {!canManage ? (
                <RequestChangeCard orgId={orgId} orgSlugOrId={orgSlugOrId} />
            ) : null}

            {/* ── Tier presets (D-16: configure by tier, override by row) ── */}
            {CHANGE_TYPE_TIERS.map((tierMeta) => {
                const rows = changeTypesForTier(tierMeta.tier);
                const editable = rows.filter((r) => !r.floorHumanOnly);
                const presetValue = tierPresetValue(tierMeta);
                return (
                    <SettingsSection
                        key={tierMeta.tier}
                        title={`Tier ${tierMeta.tier} — ${tierMeta.title}`}
                        description={`${tierMeta.reversibilityNote} (${rows.length} change ${rows.length === 1 ? "type" : "types"})`}
                        icon={Layers}
                    >
                        <SettingsSegmented<string>
                            label="Handle every change in this tier"
                            description={
                                presetValue === "mixed"
                                    ? "Rows in this tier are set individually — see Advanced overrides below."
                                    : presetValue === "defaults"
                                      ? "Following the platform defaults for each row."
                                      : `Every row in this tier is set to ${CHANGE_HANDLING_MODE_LABELS[presetValue as ChangeHandlingMode]}.`
                            }
                            value={presetValue}
                            onValueChange={(v) => void applyTierPreset(tierMeta, v)}
                            options={[{ value: "defaults", label: "Defaults" }, ...MODE_OPTIONS]}
                            size="sm"
                            fullWidth
                            disabled={!canManage || busy || editable.length === 0}
                            helpText={
                                tierMeta.tier === 1
                                    ? "In Tier 1 a lapsed review window proceeds by default. Every tier above holds."
                                    : "In this tier a lapsed review window HOLDS by default — nothing ships without a person."
                            }
                            last
                        />
                    </SettingsSection>
                );
            })}

            {/* ── Advanced overrides drawer (flat, diverged-only by default) ── */}
            <SettingsSection
                title="Advanced overrides"
                description={`${followCount} follow the platform default, ${overrideCount} customized. Per-row control over all ${CHANGE_TYPE_CATALOGUE.length} change types.`}
                icon={ClipboardCheck}
                collapsible
                defaultOpen={false}
            >
                <SettingsSwitch
                    label="Show all change types"
                    description={showAll ? "Showing the full catalogue, grouped by tier." : "Showing only rows that diverge from the platform default."}
                    checked={showAll}
                    onCheckedChange={setShowAll}
                />
                {!showAll && divergedRows.length === 0 ? (
                    <SettingsCallout tone="info" title="No overrides yet">
                        Every change type follows the platform default. Use a tier preset above, or switch on
                        “Show all change types” to set a single row.
                    </SettingsCallout>
                ) : null}
                {showAll
                    ? CHANGE_TYPE_TIERS.map((tierMeta) => (
                          <React.Fragment key={tierMeta.tier}>
                              <SettingsCallout tone="info" title={`Tier ${tierMeta.tier} — ${tierMeta.title}`}>
                                  {tierMeta.reversibilityNote}
                              </SettingsCallout>
                              {changeTypesForTier(tierMeta.tier).map((row, i, arr) => (
                                  <PolicyRow
                                      key={row.key}
                                      row={row}
                                      override={overrides.get(row.key)}
                                      canManage={canManage}
                                      busy={busy}
                                      onSave={saveRow}
                                      last={i === arr.length - 1}
                                  />
                              ))}
                          </React.Fragment>
                      ))
                    : divergedRows.map((row, i) => (
                          <PolicyRow
                              key={row.key}
                              row={row}
                              override={overrides.get(row.key)}
                              canManage={canManage}
                              busy={busy}
                              onSave={saveRow}
                              last={i === divergedRows.length - 1}
                          />
                      ))}
            </SettingsSection>
        </div>
    );
}

function PolicyRow({
    row,
    override,
    canManage,
    busy,
    onSave,
    last,
}: {
    row: ChangeTypeDef;
    override: OrgChangePolicyRow | undefined;
    canManage: boolean;
    busy: boolean;
    onSave: (row: ChangeTypeDef, mode: ChangeHandlingMode | null, timeoutMinutes?: number | null, timeoutExpiry?: TimeoutExpiry | null) => Promise<void>;
    last?: boolean;
}) {
    const effective = effectiveFor(row, override);
    const door = row.subject ? SUBJECT_DOORS[row.subject] : undefined;
    const floored = row.floorHumanOnly === true;

    const description = (
        <span>
            {row.description}
            {" · "}
            <span className="text-muted-foreground">
                Platform default: {CHANGE_HANDLING_MODE_LABELS[row.defaultMode]}
                {row.defaultMode === "review_with_timeout"
                    ? ` (expires → ${defaultTimeoutExpiryFor(row) === "proceed" ? "proceeds" : "holds"})`
                    : ""}
            </span>
            {effective.overridden && canManage && !floored ? (
                <>
                    {" · "}
                    <button
                        type="button"
                        className="underline underline-offset-2 text-primary disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void onSave(row, null)}
                    >
                        Reset to default
                    </button>
                </>
            ) : null}
            {door ? (
                <>
                    {" · "}
                    <Link href={door.href} className="inline-flex items-center gap-0.5 underline underline-offset-2 text-primary">
                        {door.label}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                </>
            ) : null}
        </span>
    );

    if (floored) {
        return (
            <SettingAnchor id={`change-policy-${row.key}`}>
                <SettingsSegmented<string>
                    label={`${row.rowNum}. ${row.label}`}
                    description={description}
                    warning="Human only, always. This row is floored in the resolver itself — no setting, seed, or org override can lift it. The system may never widen its own permissions."
                    icon={Lock}
                    value="off"
                    onValueChange={() => {
                        /* structurally floored — the RPC rejects this key for everyone */
                    }}
                    options={MODE_OPTIONS}
                    size="sm"
                    fullWidth
                    disabled
                    last={last}
                />
            </SettingAnchor>
        );
    }

    return (
        <SettingAnchor id={`change-policy-${row.key}`}>
            <SettingsSegmented<ChangeHandlingMode>
                label={`${row.rowNum}. ${row.label}`}
                description={description}
                warning={row.note}
                value={effective.mode}
                onValueChange={(mode) => void onSave(row, mode, effective.timeoutMinutes, effective.timeoutExpiry)}
                options={MODE_OPTIONS}
                size="sm"
                fullWidth
                disabled={!canManage || busy}
                modified={effective.overridden}
                last={last && effective.mode !== "review_with_timeout"}
            />
            {effective.mode === "review_with_timeout" ? (
                <>
                    <SettingsNumberInput
                        label="Review window (minutes)"
                        description={`How long a proposed change waits for a person. Platform default: ${DEFAULT_TIMEOUT_MINUTES} minutes (48 h).`}
                        value={effective.timeoutMinutes}
                        onValueChange={(v) => void onSave(row, "review_with_timeout", v, effective.timeoutExpiry)}
                        min={5}
                        max={40320}
                        step={5}
                        integer
                        unit="min"
                        disabled={!canManage || busy}
                    />
                    <SettingsSegmented<TimeoutExpiry>
                        label="When the window lapses"
                        description={
                            row.tier === 1
                                ? "Proceeds = the change ships if nobody responds. Tier 1 defaults to proceed — these are trivially reversible."
                                : "Holds = nothing happens until a person answers. Every tier above Tier 1 defaults to hold — a lapsed window is never silent approval."
                        }
                        value={effective.timeoutExpiry}
                        onValueChange={(v) => void onSave(row, "review_with_timeout", effective.timeoutMinutes, v)}
                        options={EXPIRY_OPTIONS}
                        size="sm"
                        disabled={!canManage || busy}
                        last={last}
                    />
                </>
            ) : null}
        </SettingAnchor>
    );
}

/** Non-admin path: pick a row + mode, send the request through the shipped gate. */
function RequestChangeCard({ orgId, orgSlugOrId }: { orgId: string; orgSlugOrId: string }) {
    const [key, setKey] = React.useState<string>("");
    const [mode, setMode] = React.useState<ChangeHandlingMode>("review");
    const row = CHANGE_TYPE_CATALOGUE.find((r) => r.key === key);

    return (
        <SettingsSection
            title="Request a policy change"
            description="Only organization owners and admins can change the change policy. Pick the change type and the handling you want; an admin gets a one-click request."
        >
            <SettingsSelect<string>
                label="Change type"
                value={key}
                onValueChange={setKey}
                options={CHANGE_TYPE_CATALOGUE.filter((r) => r.key !== FLOORED_CHANGE_TYPE_KEY).map((r) => ({
                    value: r.key,
                    label: `${r.rowNum}. ${r.label}`,
                }))}
                stacked
            />
            <SettingsSegmented<ChangeHandlingMode>
                label="Requested handling"
                value={mode}
                onValueChange={setMode}
                options={MODE_OPTIONS}
                size="sm"
                fullWidth
                last
            />
            <SettingAccessGate
                canManage={false}
                organizationId={orgId}
                organizationSlugOrId={orgSlugOrId}
                settingKey={row ? `change-policy-${row.key}` : "change-policy"}
                settingLabel="organization change policy"
                actionKey={ORG_CHANGE_POLICY_SET_ACTION}
                actionPayload={{
                    organization_id: orgId,
                    change_type_key: key,
                    handling_mode: mode,
                }}
                defaultMessage={
                    row
                        ? `Please set “${row.label}” to ${CHANGE_HANDLING_MODE_LABELS[mode]}.`
                        : "Please update our change policy."
                }
                requestReady={Boolean(row)}
            >
                {null}
            </SettingAccessGate>
        </SettingsSection>
    );
}
