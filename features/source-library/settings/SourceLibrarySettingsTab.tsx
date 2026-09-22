"use client";

/**
 * Media Source Catalog settings — the organization's knobs for Libraries,
 * Sources and Actions.
 *
 * THE SERVER DECLARES THE FORM. Everything on this screen — which knobs exist,
 * what they are called, their type, their bounds and their choices — comes from
 * `GET /media/settings` (API-CONTRACT.md §9). There is no list of knobs in this
 * file: a knob the server adds tomorrow renders here with no frontend change,
 * and a knob it retires disappears. `MEDIA_SETTING_KEYS` in ../types.ts is a
 * typed reference for other code, never a filter for what this tab draws.
 *
 * Writes go to the ORG scope (`PUT /media/settings`, §9) and the screen
 * re-renders from the response, so what you see is always what the server
 * holds. A refused write prints the server's own sentence and its remedy and
 * puts the control back where the server still has it — never an optimistic
 * lie.
 */

import { useCallback, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsNumberInput } from "@/components/official/settings/primitives/SettingsNumberInput";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";

import { MediaApiError, getMediaSettings, putMediaSettings } from "../api";
import type { MediaSettingKnob, MediaSettingsResponse } from "../types";

// ───────────────────────────────────────────────────────────────── helpers ──

/** Plain English for §9's `source`. Resolution is library → org → default. */
function sourceSentence(source: MediaSettingKnob["source"]): string {
    if (source === "library") return "Set on this Library.";
    if (source === "org") return "Inherited from your organization.";
    return "Platform default — nobody has changed this yet.";
}

/** A readable label for a knob the server did not label. */
function humanize(key: string): string {
    const words = key.replace(/_/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function asNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
}

function asString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    return value.every((entry) => typeof entry === "string") ? (value as string[]) : null;
}

/** What we print when a value is not the shape its own declaration promised. */
function describeValue(value: unknown): string {
    if (value === null || value === undefined) return "not set";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

/**
 * The sentence for a failed call.
 *
 * `MediaApiError` already carries the server's sentence when the server gave
 * one. When it did not — the shape this feature is in today, with the server
 * half of §9 not deployed — we say exactly what happened rather than showing an
 * empty tab or a spinner that never ends.
 */
function failureSentence(error: unknown): { message: string; remedy: string | null } {
    if (error instanceof MediaApiError) {
        if (error.hasServerSentence) {
            return { message: error.message, remedy: error.remedy };
        }
        if (error.status === 404) {
            return {
                message:
                    "The server has no media settings endpoint yet — it answered 404 for this organization's catalog settings. Nothing can be shown or changed here until the Media Source Catalog server release is live.",
                remedy:
                    "Try again after the next server deploy. If it is still missing tomorrow, tell an operator that GET /media/settings is not answering.",
            };
        }
        return {
            message: `${error.message} (the server did not explain why; it answered ${error.status ?? "no status"}.)`,
            remedy: error.remedy ?? "Try again, and tell an operator if it keeps happening.",
        };
    }
    return {
        message:
            "This screen could not reach the catalog settings and the failure carried no explanation.",
        remedy: "Try again, and tell an operator if it keeps happening.",
    };
}

// ──────────────────────────────────────────────────────────────── skeleton ──

/**
 * The real shape of the screen while it loads: a header block and rows at the
 * height the controls will occupy. Never the word "Loading".
 */
function SettingsSkeleton() {
    return (
        <div aria-busy="true" aria-live="polite" className="animate-pulse">
            <span className="sr-only">Loading your organization&rsquo;s catalog settings</span>
            <div className="border-b border-border pb-4 mb-4">
                <div className="h-5 w-56 rounded bg-muted" />
                <div className="mt-2 h-4 w-80 max-w-full rounded bg-muted" />
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
                {[0, 1, 2, 3, 4, 5].map((row) => (
                    <div
                        key={row}
                        className="flex items-center justify-between gap-4 px-4 py-3.5"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="h-4 w-40 max-w-full rounded bg-muted" />
                            <div className="mt-2 h-3 w-56 max-w-full rounded bg-muted" />
                        </div>
                        <div className="h-8 w-24 shrink-0 rounded bg-muted" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────── tab ──

export default function SourceLibrarySettingsTab() {
    const dispatch = useAppDispatch();
    // The active organization resolves AFTER the first render and every call is
    // refused until it does, so it is named as a dependency of the read — see
    // hooks/useActionRegistry.ts for the measured defect this closes.
    const organizationId = useAppSelector(selectOrganizationId);

    const [response, setResponse] = useState<MediaSettingsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadFailure, setLoadFailure] = useState<{
        message: string;
        remedy: string | null;
    } | null>(null);
    const [saveFailure, setSaveFailure] = useState<{
        key: string;
        message: string;
        remedy: string | null;
    } | null>(null);
    const [savingKey, setSavingKey] = useState<string | null>(null);
    /** Drag-in-flight values only. The server's value is the truth everywhere else. */
    const [draft, setDraft] = useState<Record<string, number>>({});

    const load = useCallback(async () => {
        setLoading(true);
        setLoadFailure(null);
        try {
            const next = await getMediaSettings(dispatch);
            setResponse(next);
        } catch (error) {
            setResponse(null);
            setLoadFailure(failureSentence(error));
        } finally {
            setLoading(false);
        }
    }, [dispatch]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, organizationId]);

    /**
     * Write one knob at the organization scope and re-render from the answer.
     * On refusal the screen keeps the value the server still holds, so the
     * control snaps back to the truth instead of showing what we wanted.
     */
    const save = useCallback(
        async (key: string, value: unknown) => {
            setSavingKey(key);
            setSaveFailure(null);
            try {
                const next = await putMediaSettings(dispatch, "org", { [key]: value });
                setResponse(next);
            } catch (error) {
                const { message, remedy } = failureSentence(error);
                setSaveFailure({ key, message, remedy });
            } finally {
                setDraft((current) => {
                    if (!(key in current)) return current;
                    const { [key]: _dropped, ...rest } = current;
                    return rest;
                });
                setSavingKey(null);
            }
        },
        [dispatch],
    );

    if (loading) return <SettingsSkeleton />;

    if (loadFailure) {
        return (
            <>
                <SettingsSubHeader
                    title="Media Source Catalog"
                    description="How this organization catalogues Libraries, Sources and Actions."
                    icon={Settings2}
                />
                <SettingsCallout tone="error" title="These settings are not available">
                    <p>{loadFailure.message}</p>
                    {loadFailure.remedy && <p className="mt-1">{loadFailure.remedy}</p>}
                </SettingsCallout>
                <SettingsSection title="Retry">
                    <SettingsButton
                        label="Check again"
                        description="Asks the server once more for this organization's catalog settings."
                        actionLabel="Check again"
                        onClick={() => void load()}
                        last
                    />
                </SettingsSection>
            </>
        );
    }

    const knobs = Object.entries(response?.settings ?? {});
    const reclassification = response?.reclassification_needed ?? 0;

    return (
        <>
            <SettingsSubHeader
                title="Media Source Catalog"
                description="How this organization catalogues Libraries, Sources and Actions. Every choice here applies to everyone in the organization; a Library can override it."
                icon={Settings2}
            />

            {reclassification > 0 && (
                <SettingsCallout
                    tone="warning"
                    // D6b (jobs-bar cold-walk-12): this count spans every Library in
                    // the organization, not only YouTube ones — "video(s)" over a
                    // podcast or blog Source is exactly the bug. This screen is
                    // organization-wide, so it uses the feature's own canonical noun
                    // (`FEATURE.md`: "Library · Source · Action") rather than one
                    // adapter's word.
                    title={`${formatCount(reclassification)} ${
                        reclassification === 1 ? "Source" : "Sources"
                    } would be classified differently`}
                >
                    Nothing has been reclassified. These settings apply to the whole
                    organization, and reclassifying runs on one Library at a time — open the
                    Library you want brought up to date and run Reclassify there.
                </SettingsCallout>
            )}

            {saveFailure && (
                <SettingsCallout tone="error" title="That change was not saved">
                    <p>{saveFailure.message}</p>
                    {saveFailure.remedy && <p className="mt-1">{saveFailure.remedy}</p>}
                    <p className="mt-1">
                        The control below shows the value the server still holds.
                    </p>
                </SettingsCallout>
            )}

            {knobs.length === 0 ? (
                <SettingsCallout tone="info" title="No settings to show">
                    The server answered, but declared no catalog settings for this
                    organization. Nothing is hidden here — when it declares one, it appears
                    on this screen by itself.
                </SettingsCallout>
            ) : (
                <SettingsSection
                    title="Catalog behavior"
                    description="Declared by the server. New settings appear here automatically."
                >
                    {knobs.map(([key, knob], index) => (
                        <KnobRow
                            key={key}
                            settingKey={key}
                            knob={knob}
                            last={index === knobs.length - 1}
                            busy={savingKey === key}
                            disabled={savingKey !== null && savingKey !== key}
                            draftValue={draft[key]}
                            onDraft={(value) =>
                                setDraft((current) => ({ ...current, [key]: value }))
                            }
                            onCommit={(value) => void save(key, value)}
                        />
                    ))}
                </SettingsSection>
            )}
        </>
    );
}

// ──────────────────────────────────────────────────────────────── one knob ──

type KnobRowProps = {
    settingKey: string;
    knob: MediaSettingKnob;
    last: boolean;
    busy: boolean;
    disabled: boolean;
    draftValue: number | undefined;
    onDraft: (value: number) => void;
    onCommit: (value: unknown) => void;
};

/**
 * One declared knob, drawn from its own declaration.
 *
 * A type this screen cannot draw is shown read-only with the reason — never a
 * control that looks alive and does nothing.
 */
function KnobRow({
    settingKey,
    knob,
    last,
    busy,
    disabled,
    draftValue,
    onDraft,
    onCommit,
}: KnobRowProps) {
    const label = knob.label ?? humanize(settingKey);
    const description = sourceSentence(knob.source);
    const modified = JSON.stringify(knob.value) !== JSON.stringify(knob.default);
    const common = {
        label,
        description,
        modified,
        disabled: disabled || busy,
        helpText: `Setting key: ${settingKey}`,
        last,
    };

    if (knob.type === "boolean") {
        const value = asBoolean(knob.value);
        if (value === null) return <UnsupportedKnob {...common} knob={knob} />;
        return (
            <SettingsSwitch
                {...common}
                checked={value}
                onCheckedChange={(next) => onCommit(next)}
            />
        );
    }

    if (knob.type === "integer") {
        const value = asNumber(knob.value);
        if (value === null) return <UnsupportedKnob {...common} knob={knob} />;
        if (typeof knob.min === "number" && typeof knob.max === "number") {
            return (
                <SettingsSlider
                    {...common}
                    value={draftValue ?? value}
                    onValueChange={onDraft}
                    onValueCommit={(next) => onCommit(next)}
                    min={knob.min}
                    max={knob.max}
                    step={1}
                    precision={0}
                />
            );
        }
        return (
            <SettingsNumberInput
                {...common}
                value={value}
                onValueChange={(next) => onCommit(next)}
                {...(typeof knob.min === "number" ? { min: knob.min } : {})}
                {...(typeof knob.max === "number" ? { max: knob.max } : {})}
                integer
            />
        );
    }

    if (knob.type === "enum") {
        const value = asString(knob.value);
        const options = knob.options;
        if (value === null || !options?.length) {
            return <UnsupportedKnob {...common} knob={knob} />;
        }
        return (
            <SettingsSelect
                {...common}
                value={value}
                onValueChange={(next) => onCommit(next)}
                options={options.map((option) => ({
                    value: option,
                    label: humanize(option),
                }))}
            />
        );
    }

    if (knob.type === "string_array") {
        const value = asStringArray(knob.value);
        if (value === null) return <UnsupportedKnob {...common} knob={knob} />;
        return (
            <SettingsTextInput
                {...common}
                description={`${description} Separate each entry with a comma, most preferred first.`}
                value={value.join(", ")}
                onValueChange={(next) =>
                    onCommit(
                        next
                            .split(",")
                            .map((entry) => entry.trim())
                            .filter((entry) => entry.length > 0),
                    )
                }
                commitOnBlur
                stacked
            />
        );
    }

    if (knob.type === "string") {
        const value = asString(knob.value);
        if (value === null) return <UnsupportedKnob {...common} knob={knob} />;
        return (
            <SettingsTextInput
                {...common}
                value={value}
                onValueChange={(next) => onCommit(next)}
                commitOnBlur
            />
        );
    }

    return <UnsupportedKnob {...common} knob={knob} />;
}

type UnsupportedKnobProps = {
    label: string;
    description: string;
    modified: boolean;
    disabled: boolean;
    helpText: string;
    last: boolean;
    knob: MediaSettingKnob;
};

function UnsupportedKnob({
    label,
    description,
    helpText,
    last,
    knob,
}: UnsupportedKnobProps) {
    return (
        <SettingsReadOnlyValue
            label={label}
            description={description}
            helpText={helpText}
            warning={`This screen cannot edit a "${knob.type}" setting holding this value yet. It is shown as the server reports it; tell an operator if you need to change it here.`}
            value={describeValue(knob.value)}
            mono
            last={last}
        />
    );
}
